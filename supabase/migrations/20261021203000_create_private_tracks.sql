create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'RC-tur' check (char_length(name) between 1 and 120),
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint trips_time_order check (ended_at is null or ended_at >= started_at)
);

create table public.gps_samples (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  sample_index integer not null check (sample_index >= 0),
  recorded_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  speed_kmh double precision not null check (speed_kmh between 0 and 500),
  constraint gps_samples_trip_order unique (trip_id, sample_index)
);

create index trips_user_started_at_idx
  on public.trips (user_id, started_at desc);

create index gps_samples_trip_recorded_at_idx
  on public.gps_samples (trip_id, recorded_at);

alter table public.trips enable row level security;
alter table public.gps_samples enable row level security;

revoke all on table public.trips, public.gps_samples from public, anon, authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, delete on table public.gps_samples to authenticated;

create policy "Users can read their own trips"
  on public.trips for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own trips"
  on public.trips for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own trips"
  on public.trips for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own trips"
  on public.trips for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read samples from their own trips"
  on public.gps_samples for select
  to authenticated
  using (
    exists (
      select 1
      from public.trips
      where trips.id = gps_samples.trip_id
        and trips.user_id = (select auth.uid())
    )
  );

create policy "Users can add samples to their own trips"
  on public.gps_samples for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.trips
      where trips.id = gps_samples.trip_id
        and trips.user_id = (select auth.uid())
    )
  );

create policy "Users can delete samples from their own trips"
  on public.gps_samples for delete
  to authenticated
  using (
    exists (
      select 1
      from public.trips
      where trips.id = gps_samples.trip_id
        and trips.user_id = (select auth.uid())
    )
  );
