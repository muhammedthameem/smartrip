-- SmartTrip: Driver Daily Trip Mode & Multi-Day Package Itinerary
begin;

create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number integer not null check(day_number > 0),
  date date not null,
  name text not null,
  origin text,
  destination text,
  planned_destinations jsonb not null default '[]',
  status text not null default 'pending' check(status in ('pending', 'in progress', 'completed')),
  opening_km numeric(12,2) check(opening_km >= 0),
  closing_km numeric(12,2),
  opening_source text check(opening_source in ('manual', 'photo', 'previous_day')),
  closing_source text check(closing_source in ('manual', 'photo')),
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  archived boolean not null default false,
  request_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, trip_id, day_number),
  constraint day_reading_order check(closing_km is null or (opening_km is not null and closing_km >= opening_km)),
  constraint day_time_order check(ended_at is null or (started_at is not null and ended_at >= started_at))
);

create table if not exists public.trip_place_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_day_id uuid not null references public.trip_days(id) on delete cascade,
  name text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy numeric(8,2),
  location_source text not null default 'manual' check(location_source in ('gps', 'gps_reverse_geocoded', 'search', 'manual')),
  planned_destination text,
  odometer numeric(12,2) check(odometer >= 0),
  reached_at timestamptz not null default now(),
  notes text,
  archived boolean not null default false,
  request_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.trip_days enable row level security;
alter table public.trip_place_events enable row level security;

-- Indices for performance
create index if not exists idx_trip_days_trip on public.trip_days(org_id, trip_id, day_number);
create index if not exists idx_trip_days_date on public.trip_days(org_id, date);
create index if not exists idx_trip_place_events_day on public.trip_place_events(org_id, trip_day_id, reached_at);

-- Helper for user organization resolution across admin, staff, and driver
create or replace function public.user_org() returns uuid language sql stable security definer set search_path=public as $$
  select org_id from public.profiles where id = auth.uid() and role in ('admin', 'staff', 'driver');
$$;

-- Policies for trip_days
create policy tenant_trip_days_read on public.trip_days for select to authenticated using (org_id = public.user_org());
create policy tenant_trip_days_insert on public.trip_days for insert to authenticated with check (org_id = public.user_org());
create policy tenant_trip_days_update on public.trip_days for update to authenticated using (org_id = public.user_org()) with check (org_id = public.user_org());

-- Policies for trip_place_events
create policy tenant_place_events_read on public.trip_place_events for select to authenticated using (org_id = public.user_org());
create policy tenant_place_events_insert on public.trip_place_events for insert to authenticated with check (org_id = public.user_org());
create policy tenant_place_events_update on public.trip_place_events for update to authenticated using (org_id = public.user_org()) with check (org_id = public.user_org());

-- Audit & touch triggers
create trigger audit_trip_days after insert or update on public.trip_days for each row execute function public.audit_record();
create trigger touch_trip_days before update on public.trip_days for each row execute function public.touch_record();

create trigger audit_trip_place_events after insert or update on public.trip_place_events for each row execute function public.audit_record();
create trigger touch_trip_place_events before update on public.trip_place_events for each row execute function public.touch_record();

-- Grant permissions to authenticated
grant select, insert, update on public.trip_days to authenticated;
grant select, insert, update on public.trip_place_events to authenticated;
revoke delete on public.trip_days from authenticated;
revoke delete on public.trip_place_events from authenticated;

commit;
