"""Actual PostgreSQL: credit grants, reservations, retries, refunds and privileges."""
import pathlib
import subprocess
import tempfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='reelstudio-ai-credits-') as folder:
    cluster = pathlib.Path(folder) / 'data'
    def run(*args): return subprocess.run(args, check=True, capture_output=True, text=True)
    run('initdb', '-D', str(cluster), '--auth=trust', '--no-locale')
    run('pg_ctl', '-D', str(cluster), '-l', str(pathlib.Path(folder) / 'log'), '-o', f'-h 127.0.0.1 -k {folder} -p 65439', '-w', 'start')
    def sql(query, succeeds=True):
        result = subprocess.run(['psql', '-h', folder, '-p', '65439', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=query, capture_output=True, text=True)
        assert (result.returncode == 0) == succeeds, result.stderr
        return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ''
    owner='11111111-1111-4111-8111-111111111111'; other='22222222-2222-4222-8222-222222222222'
    video='33333333-3333-4333-8333-333333333333'; attempt='44444444-4444-4444-8444-444444444444'; second='55555555-5555-4555-8555-555555555555'
    source='a'*64+':standard'
    def reserve(who=owner, token=attempt, cost=3, version=source):
        return f"select reelstudio_ai_reserve('{who}','{video}','{token}','{version}',{cost});"
    def finish(result='null', token=attempt, version=source):
        return f"select reelstudio_ai_finish('{owner}','{video}','{version}','{token}',{result});"
    try:
        sql('''create role anon; create role authenticated; create role service_role bypassrls;
          create schema auth; create table auth.users(id uuid primary key);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          create table reelstudio_projects(user_id uuid,id uuid,video jsonb,deleted_at timestamptz);
        ''')
        sql((ROOT/'migrations/20261017_reelstudio_ai_credits.sql').read_text())
        sql(f"insert into auth.users values('{owner}'),('{other}'); insert into reelstudio_projects values('{owner}','{video}','{{}}',null);")
        assert 'credits' in sql(reserve())
        sql(f"insert into reelstudio_credit_orders(id,user_id,amount,credits) values('order_test','{owner}',1000,10);")
        sql("set role service_role; select reelstudio_credit_payment('order_test'); select reelstudio_credit_payment('order_test');")
        assert sql('select balance from reelstudio_credit_wallets;')=='10'
        sql('set role authenticated; '+reserve(),False)
        sql('set role authenticated; update reelstudio_credit_wallets set balance=1000;',False)
        assert 'project' in sql(reserve(other))
        assert 'token' in sql(reserve())
        assert sql('select balance from reelstudio_credit_wallets;')=='7'
        assert 'busy' in sql(reserve(token=second))
        assert sql(finish())=='t'
        assert sql(finish())=='f'
        assert sql('select balance from reelstudio_credit_wallets;')=='10'
        sql(reserve()); sql(finish("'{\"summary\":\"Ready\"}'::jsonb"))
        assert 'cached' in sql(reserve())
        sql(reserve(token=second)); sql(finish("'{\"summary\":\"Revision\"}'::jsonb",second))
        assert sql('select balance from reelstudio_credit_wallets;')=='7'
        high='a'*64+':high'
        sql(reserve(version=high,cost=6))
        assert sql('select balance from reelstudio_credit_wallets;')=='1'
        sql("update reelstudio_ai_videos set expires_at=now()-interval '1 minute' where not unlocked;")
        sql(reserve(token=second,version=high,cost=6))
        assert sql('select balance from reelstudio_credit_wallets;')=='1'
        assert sql(finish(token=attempt,version=high))=='f'
        sql(finish(token=second,version=high))
        assert sql('select balance from reelstudio_credit_wallets;')=='7'
        sql(reserve(cost=-1),False)
        print('PASS: idempotent payment, protected balances, owner isolation, per-duration charge, same-video revisions, quality pricing, refund once, expired recovery, stale completion, cached retry')
    finally:
        run('pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop')
