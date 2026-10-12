-- Shared fixed-window rate limiting for API routes. Only the service role can call it.

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);
-- No policies: the table is reachable only through check_rate_limit.
alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_start timestamptz;
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= now() - v_window then now() else r.window_start end,
    count = case when r.window_start <= now() - v_window then 1 else r.count + 1 end
  returning r.window_start, r.count into v_start, v_count;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select v_count <= p_limit,
    greatest(0, ceil(extract(epoch from (v_start + v_window - now()))))::integer;
end
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
