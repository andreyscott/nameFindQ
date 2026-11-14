-- F4: protect the curated dictionary from AI overwrites.
--
-- names.source marks where a row came from:
--   seed — curated rows from data/*.json (never modified by the app)
--   ai   — rows written by /api/namefind (may be refreshed by later AI results)
--
-- Apply once (Supabase SQL editor or psql). Safe to re-run.

alter table public.names
  add column if not exists source text not null default 'ai';

do $$ begin
  alter table public.names add constraint names_source_check check (source in ('seed', 'ai'));
exception when duplicate_object then null; end $$;

-- Backfill: rows whose name appears in the seed files are curated.
update public.names n
set source = 'seed'
from (values
    ('Abiola'),
    ('Adaeze'),
    ('Adebayọ'),
    ('Adegoke'),
    ('Adeola'),
    ('Adesuwa'),
    ('Adeyemi'),
    ('Aisosa'),
    ('Akhere'),
    ('Akin'),
    ('Amara'),
    ('Amenaghawon'),
    ('Arinze'),
    ('Ayọmiide'),
    ('Ayọ̀'),
    ('Babatunde'),
    ('Chiamaka'),
    ('Chibuzor'),
    ('Chidiebube'),
    ('Chidinma'),
    ('Chidubem'),
    ('Chiemezie'),
    ('Chijioke'),
    ('Chike'),
    ('Chinaza'),
    ('Chisom'),
    ('Chizoba'),
    ('Dayo'),
    ('Ebere'),
    ('Efe'),
    ('Egbe'),
    ('Eghosa'),
    ('Ehizogie'),
    ('Ekenedilichukwu'),
    ('Eki'),
    ('Eniola'),
    ('Enitan'),
    ('Esohe'),
    ('Esosa'),
    ('Ezinne'),
    ('Folashade'),
    ('Funmilayo'),
    ('Ibukunoluwa'),
    ('Idia'),
    ('Ifeanyi'),
    ('Ifedayo'),
    ('Ifeoma'),
    ('Igho'),
    ('Iyore'),
    ('Kamsiyochukwu'),
    ('Kehinde'),
    ('Kenechukwu'),
    ('Morenikeji'),
    ('Ngozi'),
    ('Nneka'),
    ('Nosakhare'),
    ('Obinna'),
    ('Olubunmi'),
    ('Oluchi'),
    ('Olumide'),
    ('Olusegun'),
    ('Oluwafemi'),
    ('Oluwasegun'),
    ('Oluwaseun'),
    ('Oluwatimilehin'),
    ('Oluwatobi'),
    ('Omosigho'),
    ('Onyeka'),
    ('Opeyemi'),
    ('Orobosa'),
    ('Osagie'),
    ('Osahon'),
    ('Osaigbovo'),
    ('Osariemen'),
    ('Osayomore'),
    ('Oseghale'),
    ('Osemudiamen'),
    ('Ozioma'),
    ('Taiwo'),
    ('Titilayo'),
    ('Tochukwu'),
    ('Uchenna'),
    ('Uyi'),
    ('chidiebere')
) as s(name)
where lower(n.name) = lower(s.name);

create index if not exists idx_names_lower_name on public.names (lower(name));

-- AI write-back: insert new names, refresh existing AI rows, never touch seed
-- rows (also skips a different-case spelling of a seed name).
create or replace function public.upsert_ai_names(rows jsonb)
returns integer
language sql
security invoker
set search_path = public
as $fn$
  with incoming as (
    select distinct on (lower(r.name)) r.*
    from jsonb_to_recordset(rows) as r(
      name text, primary_meaning text, contextual_meaning text, region_origin text,
      ethnicity_tribe text, linguistic_root text, gender text, pronunciation text,
      vibe_tags text[], etymology jsonb
    )
    where r.name is not null and length(trim(r.name)) between 1 and 60
      and not exists (
        select 1 from public.names s
        where lower(s.name) = lower(r.name) and s.source = 'seed'
      )
  ), written as (
    insert into public.names as n (
      name, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe,
      linguistic_root, gender, pronunciation, vibe_tags, etymology, source
    )
    select name, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe,
           linguistic_root, gender, pronunciation, vibe_tags, etymology, 'ai'
    from incoming
    on conflict (name) do update set
      primary_meaning    = excluded.primary_meaning,
      contextual_meaning = excluded.contextual_meaning,
      region_origin      = excluded.region_origin,
      ethnicity_tribe    = excluded.ethnicity_tribe,
      linguistic_root    = excluded.linguistic_root,
      gender             = excluded.gender,
      pronunciation      = excluded.pronunciation,
      vibe_tags          = excluded.vibe_tags,
      etymology          = excluded.etymology
    where n.source = 'ai'
    returning 1
  )
  select count(*)::int from written;
$fn$;

-- Only the server (service role) may call it.
revoke execute on function public.upsert_ai_names(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_ai_names(jsonb) to service_role;
