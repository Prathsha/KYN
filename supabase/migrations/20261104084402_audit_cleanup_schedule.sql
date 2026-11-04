-- Production scheduled cleanup; run after the audit remediation migration.
create extension if not exists pg_cron;
select cron.schedule('kyn-expire-requests','* * * * *','select public.expire_requests()');
