-- Per-user, transactional AI budget. No service-role client is used by the function.
create table public.ai_usage(user_id uuid primary key references auth.users(id) on delete cascade, window_start timestamptz not null, requests integer not null);
alter table public.ai_usage enable row level security;
create or replace function public.consume_ai_request() returns void language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if public.current_org() is null then raise exception 'Office access required'; end if;
 insert into public.ai_usage values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(user_id) do update set requests=case when ai_usage.window_start=date_trunc('hour',now()) then ai_usage.requests+1 else 1 end,window_start=date_trunc('hour',now()) returning requests into n;
 if n>30 then raise exception 'Hourly AI limit reached'; end if;
end;$$;
revoke all on function public.consume_ai_request() from public,anon;
grant execute on function public.consume_ai_request() to authenticated;
