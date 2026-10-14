"""Test the migration's owner policies in an isolated local Postgres cluster.
Requires initdb, pg_ctl and psql. No production connection or credentials are used.
Supabase's auth.uid and storage.foldername functions are represented by fixtures;
this tests actual Postgres RLS, not GoTrue/Kong/storage HTTP configuration.
"""
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='reelstudio-rls-') as folder:
    cluster = pathlib.Path(folder) / 'data'
    def run(*args):
        return subprocess.run(args, check=True, capture_output=True, text=True)
    run('initdb', '-D', str(cluster), '--auth=trust', '--no-locale')
    run('pg_ctl', '-D', str(cluster), '-l', str(pathlib.Path(folder) / 'log'), '-o', f'-h 127.0.0.1 -k {folder} -p 65439', '-w', 'start')
    def sql(query, succeeds=True):
        result = subprocess.run(['psql', '-h', folder, '-p', '65439', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=query, capture_output=True, text=True)
        assert (result.returncode == 0) == succeeds, result.stderr
        return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ''
    try:
        sql('''create role anon; create role authenticated;
          create schema auth; create schema storage;
          create table auth.users(id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
          create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
          create table storage.objects(id uuid primary key,bucket_id text,name text);
          alter table storage.objects enable row level security;
          grant usage on schema public,auth,storage to anon,authenticated;
          grant all on storage.objects to authenticated;
          insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');''')
        sql((ROOT / 'migrations/20261014_reelstudio_projects.sql').read_text())
        owner = "set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);"
        other = "set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);"
        sql(owner + "insert into reelstudio_projects(id,name,payload,video) values ('33333333-3333-4333-8333-333333333333','Private reel','{}','{}'); insert into storage.objects values ('44444444-4444-4444-8444-444444444444','reelstudio-videos','11111111-1111-4111-8111-111111111111/project/original');")
        assert sql(owner + 'select count(*) from reelstudio_projects;') == '1'
        assert sql(other + 'select count(*) from reelstudio_projects;') == '0'
        assert sql(other + 'select count(*) from storage.objects;') == '0'
        sql('set role anon; select * from reelstudio_projects;', succeeds=False)
        sql(other + "insert into reelstudio_projects(id,user_id,name,payload,video) values ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','Hijack','{}','{}');", succeeds=False)
        sql(other + "insert into storage.objects values ('55555555-5555-4555-8555-555555555555','reelstudio-videos','11111111-1111-4111-8111-111111111111/hijack/original');", succeeds=False)
        sql(owner + 'update reelstudio_projects set deleted_at=now(); update reelstudio_projects set deleted_at=null;')
        assert sql(owner + 'select count(*) from reelstudio_projects where deleted_at is null;') == '1'
        print('PASS: migration, owner access, anonymous denial, cross-account project/video isolation, and restore')
    finally:
        run('pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop')
