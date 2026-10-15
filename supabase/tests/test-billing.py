"""Actual PostgreSQL billing/RLS checks in an isolated disposable cluster."""
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='reelstudio-billing-') as folder:
    cluster = pathlib.Path(folder) / 'data'
    def run(*args):
        return subprocess.run(args, check=True, capture_output=True, text=True)
    run('initdb', '-D', str(cluster), '--auth=trust', '--no-locale')
    run('pg_ctl', '-D', str(cluster), '-l', str(pathlib.Path(folder) / 'log'), '-o', f'-h 127.0.0.1 -k {folder} -p 65438', '-w', 'start')
    def sql(query, succeeds=True):
        result = subprocess.run(['psql', '-h', folder, '-p', '65438', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=query, capture_output=True, text=True)
        assert (result.returncode == 0) == succeeds, result.stderr
        return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ''
    owner_id = '11111111-1111-4111-8111-111111111111'
    other_id = '22222222-2222-4222-8222-222222222222'
    owner = f"set role authenticated; select set_config('request.jwt.claim.sub','{owner_id}',false);"
    other = f"set role authenticated; select set_config('request.jwt.claim.sub','{other_id}',false);"
    try:
        sql('''create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create schema storage;
          create table auth.users(id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
          create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
          create table storage.objects(id uuid primary key,bucket_id text,name text);
          alter table storage.objects enable row level security;
          create table public.reelstudio_admins(user_id uuid primary key);
          grant usage on schema public,auth,storage to anon,authenticated,service_role;
          grant all on storage.objects to authenticated;
          insert into auth.users values ('11111111-1111-4111-8111-111111111111');''')
        sql((ROOT / 'migrations/20261014_reelstudio_projects.sql').read_text())
        sql((ROOT / 'migrations/20261016_reelstudio_billing.sql').read_text())
        sql((ROOT / 'migrations/20261017_reelstudio_weekly_plan.sql').read_text())
        sql(f"insert into auth.users values ('{other_id}');")
        assert sql('select count(*) from reelstudio_billing_accounts;') == '2'
        assert sql(owner + 'select reelstudio_has_access();') == 't'
        assert sql(owner + "select (reelstudio_billing_status()->>'allowed')::boolean;") == 't'
        sql(owner + 'update reelstudio_billing_accounts set trial_ends_at=now()+interval \'100 years\';', succeeds=False)
        sql(owner + "select reelstudio_reserve_checkout('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');", succeeds=False)
        sql('set role anon; select reelstudio_billing_status();', succeeds=False)
        sql(owner + "insert into reelstudio_projects(id,name,payload,video) values ('33333333-3333-4333-8333-333333333333','Trial reel','{}','{}');")
        sql(f"update reelstudio_billing_accounts set trial_started_at=now()-interval '6 days',trial_ends_at=now()-interval '1 day' where user_id='{owner_id}';")
        assert sql(owner + 'select reelstudio_has_access();') == 'f'
        sql(owner + "update reelstudio_projects set name='Bypass';")
        assert sql(owner + 'select name from reelstudio_projects;') == 'Trial reel'
        sql(owner + "insert into reelstudio_projects(id,name,payload,video) values ('44444444-4444-4444-8444-444444444444','Bypass','{}','{}');", succeeds=False)
        sql(owner + f"insert into storage.objects values ('44444444-4444-4444-8444-444444444444','reelstudio-videos','{owner_id}/project/original');", succeeds=False)
        assert sql(f"set role service_role; select reelstudio_reserve_checkout('{owner_id}','33333333-3333-4333-8333-333333333333');") == 't'
        assert sql(f"set role service_role; select reelstudio_reserve_checkout('{owner_id}','44444444-4444-4444-8444-444444444444');") == 'f'
        sql(f"set role service_role; insert into reelstudio_subscriptions(id,user_id,plan_id,status,checked_at) values ('sub_test','{owner_id}','plan_test','authenticated',now()-interval '1 minute');")
        sql(f"update reelstudio_billing_accounts set checkout_token=null where user_id='{owner_id}';")
        assert sql(f"set role service_role; select reelstudio_reserve_checkout('{owner_id}','44444444-4444-4444-8444-444444444444');") == 'f'
        assert sql(owner + 'select reelstudio_has_access();') == 'f'
        sql("set role service_role; select reelstudio_sync_subscription('sub_test','active',now()+interval '30 days',now()+interval '30 days',false,now());")
        assert sql(owner + 'select reelstudio_has_access();') == 't'
        assert sql(other + "select coalesce(reelstudio_billing_status()->>'paid_until','none');") == 'none'
        sql(owner + "update reelstudio_projects set name='Paid reel';")
        assert sql(owner + 'select name from reelstudio_projects;') == 'Paid reel'
        sql("set role service_role; select reelstudio_sync_subscription('sub_test','expired',null,null,false,now()-interval '1 day');")
        assert sql("select status from reelstudio_subscriptions where id='sub_test';") == 'active'
        sql("set role service_role; select reelstudio_sync_subscription('sub_test','cancelled',null,null,true,now());")
        assert sql(owner + 'select reelstudio_has_access();') == 't'
        sql("update reelstudio_subscriptions set paid_until=now()-interval '1 second';")
        assert sql(owner + 'select reelstudio_has_access();') == 'f'
        sql(f"insert into reelstudio_admins values ('{owner_id}');")
        assert sql(owner + 'select reelstudio_has_access();') == 't'
        sql(f"insert into reelstudio_subscriptions(id,user_id,plan_id,billing_cycle,status,paid_until) values ('sub_weekly','{other_id}','plan_weekly','weekly','active',now()+interval '7 days');")
        assert sql(other + "select reelstudio_billing_status()->'subscription'->>'billing_cycle';") == 'weekly'
        assert sql(other + 'select reelstudio_has_access();') == 't'
        sql("update reelstudio_subscriptions set paid_until=now()-interval '1 second' where id='sub_weekly';")
        sql(f"update reelstudio_billing_accounts set trial_started_at=now()-interval '6 days',trial_ends_at=now()-interval '1 day' where user_id='{other_id}';")
        assert sql(other + 'select reelstudio_has_access();') == 'f'
        print('PASS: signup trial, existing-user trial, protected timestamps, expiry, cloud-write denial, owner isolation, checkout reservation, paid access, stale events, cancellation, admin access')
    finally:
        run('pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop')
