-- F3: shared rate limits, daily quotas and the global AI budget.
--
-- One row per (bucket, fixed window). Buckets look like:
--   burst:user:<uuid>      search:ip:<hash>      tree:user:<uuid>      ai:global
-- IPs are stored only as salted SHA-256 prefixes (see lib/quota.ts).
--
-- Apply once (Supabase SQL editor or psql). Safe to re-run.

create table if not exists public.api_usage (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

-- No policies: only the service role (which bypasses RLS) can touch it.
alter table public.api_usage enable row level security;

create index if not exists idx_api_usage_window on public.api_usage (window_start);

-- Atomically increments each bucket in order and stops at the first one that
-- is over its limit (later buckets are not charged).
-- Returns {"allowed": bool, "blocked": 1-based index | null, "counts": int[]}.
create or replace function public.consume_quota(
  p_buckets text[],
  p_windows integer[],
  p_limits  integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  i       integer;
  c       integer;
  ws      timestamptz;
  counts  integer[] := '{}';
  blocked integer := null;
begin
  if coalesce(array_length(p_buckets, 1), 0) = 0
     or array_length(p_buckets, 1) <> array_length(p_windows, 1)
     or array_length(p_buckets, 1) <> array_length(p_limits, 1) then
    raise exception 'consume_quota: bucket/window/limit arrays must be non-empty and equal length';
  end if;

  for i in 1 .. array_length(p_buckets, 1) loop
    ws := to_timestamp(floor(extract(epoch from now()) / p_windows[i]) * p_windows[i]);

    insert into public.api_usage as u (bucket, window_start, count)
    values (p_buckets[i], ws, 1)
    on conflict (bucket, window_start) do update set count = u.count + 1
    returning u.count into c;

    counts := counts || c;

    if c > p_limits[i] then
      blocked := i;
      exit;
    end if;
  end loop;

  -- Opportunistic cleanup keeps the table tiny on the Free plan.
  if random() < 0.01 then
    delete from public.api_usage where window_start < now() - interval '3 days';
  end if;

  return jsonb_build_object('allowed', blocked is null, 'blocked', blocked, 'counts', to_jsonb(counts));
end;
$fn$;

revoke execute on function public.consume_quota(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.consume_quota(text[], integer[], integer[]) to service_role;
