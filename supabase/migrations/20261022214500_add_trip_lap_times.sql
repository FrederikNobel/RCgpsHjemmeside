alter table public.trips
  add column laps jsonb not null default '[]'::jsonb
  check (jsonb_typeof(laps) = 'array');
