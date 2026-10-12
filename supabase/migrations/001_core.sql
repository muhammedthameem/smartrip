-- Run once in a new Supabase project's SQL editor. No secrets belong in this file.
begin;
create extension if not exists pgcrypto;
create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table public.profiles(id uuid primary key references auth.users(id),org_id uuid not null references public.organizations(id),role text not null check(role in ('admin','staff','driver','client')),created_at timestamptz not null default now());
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create function public.current_org() returns uuid language sql stable security definer set search_path=public as $$select org_id from public.profiles where id=auth.uid() and role in ('admin','staff')$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
create policy own_organization on public.organizations for select to authenticated using(id=public.current_org());

-- Common ownership, timestamps and historical archive columns.
do $$declare t text;begin foreach t in array array['clients','vehicles','drivers','bookings','trips','expenses','fuel_logs','maintenance','invoices','payments','documents','settings'] loop
 execute format('create table public.%I (id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),name text,archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,id))',t);
 execute format('alter table public.%I enable row level security',t);
 execute format('create index on public.%I(org_id,created_at desc)',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using(org_id=public.current_org())',t);
 execute format('create policy tenant_insert on public.%I for insert to authenticated with check(org_id=public.current_org())',t);
 if t not in ('payments') then execute format('create policy tenant_update on public.%I for update to authenticated using(org_id=public.current_org()) with check(org_id=public.current_org())',t);end if;
end loop;end $$;
do $$declare t text;begin foreach t in array array['clients','vehicles','drivers','bookings','trips','expenses','fuel_logs','maintenance','invoices','payments','documents','settings'] loop
 execute format('alter table public.%I add request_key uuid not null default gen_random_uuid(),add unique(org_id,request_key)',t);
 execute format('alter table public.%I alter column name set not null',t);
end loop;end $$;
alter table public.clients add phone text,add email text,add address text,add constraint client_name check(length(trim(name))>0);
alter table public.vehicles add model text,add type text,add seats integer check(seats>0),add odometer numeric(12,2) check(odometer>=0),add expiry_date date,add constraint vehicle_name check(length(trim(name))>0);
create unique index vehicle_registration on public.vehicles(org_id,lower(name)) where not archived;
alter table public.drivers add phone text,add license text,add expiry_date date,add user_id uuid references auth.users(id),add constraint driver_name check(length(trim(name))>0);
alter table public.bookings add client_id uuid,add vehicle_id uuid,add driver_id uuid,add date date not null,add pickup_time time,add origin text not null,add destination text not null,add passengers integer check(passengers>0),add status text not null default 'booked' check(status in ('booked','confirmed','cancelled')),add notes text,add trip_id uuid;
alter table public.trips add client_id uuid,add vehicle_id uuid,add driver_id uuid,add booking_id uuid,add date date not null,add origin text,add destination text,add passengers integer check(passengers>0),add status text not null default 'draft' check(status in ('draft','booked','planned','in progress','completed','cancelled')),add opening_km numeric(12,2) check(opening_km>=0),add closing_km numeric(12,2),add start_time timestamptz,add end_time timestamptz,add places jsonb not null default '[]',add pricing text not null default 'fixed' check(pricing in ('fixed','per km','per hour','package/day','custom')),add rate_minor bigint not null default 0 check(rate_minor>=0 and rate_minor<=99999999999),add ac text default 'AC' check(ac in ('AC','Non-AC')),add night_halts integer default 0 check(night_halts>=0),add notes text,add gps_estimated_km numeric(12,2),add constraint reading_order check(closing_km is null or (opening_km is not null and closing_km>=opening_km)),add constraint time_order check(end_time is null or (start_time is not null and end_time>=start_time)),add constraint complete_trip check(status<>'completed' or (opening_km is not null and closing_km is not null and start_time is not null and end_time is not null)),add constraint active_trip check(status in ('draft','cancelled') or (client_id is not null and vehicle_id is not null and driver_id is not null and length(trim(origin))>0 and length(trim(destination))>0));
alter table public.expenses add date date not null,add trip_id uuid,add vehicle_id uuid,add category text not null,add amount_minor bigint not null check(amount_minor>0 and amount_minor<=99999999999),add notes text;
alter table public.maintenance add vehicle_id uuid not null,add date date not null,add odometer numeric(12,2) check(odometer>=0),add vendor text,add amount_minor bigint not null check(amount_minor>=0 and amount_minor<=99999999999),add next_date date,add next_odometer numeric(12,2) check(next_odometer>=0),add notes text;
alter table public.fuel_logs add vehicle_id uuid not null,add trip_id uuid,add date date not null,add odometer numeric(12,2) not null check(odometer>=0),add unit text not null check(unit in ('litres','kWh')),add quantity numeric(12,2) not null check(quantity>0),add amount_minor bigint not null check(amount_minor>0 and amount_minor<=99999999999),add full_tank text not null default 'no' check(full_tank in ('yes','no'));
alter table public.invoices add trip_id uuid,add client_id uuid not null,add date date not null,add due_date date not null,add status text not null default 'issued' check(status in ('issued','cancelled')),add items jsonb not null,add discount_minor bigint not null default 0 check(discount_minor>=0),add tax_bps integer not null default 0 check(tax_bps between 0 and 10000),add total_minor bigint not null check(total_minor>0 and total_minor<=99999999999),add notes text;
create unique index one_active_invoice_per_trip on public.invoices(org_id,trip_id) where status='issued' and trip_id is not null;
alter table public.payments add invoice_id uuid not null,add date date not null,add amount_minor bigint not null check(amount_minor>0 and amount_minor<=99999999999),add kind text not null check(kind in ('payment','refund')),add method text not null,add reference text,add notes text;
create unique index unique_payment_reference on public.payments(org_id,reference,kind) where reference is not null and length(trim(reference))>0;
alter table public.documents add type text not null,add trip_id uuid,add path text not null,add processing_status text not null default 'manual review',add verified boolean not null default false;
alter table public.settings add phone text,add address text,add invoice_prefix text not null default 'INV' check(invoice_prefix~'^[A-Za-z0-9-]{1,10}$'),add voucher_prefix text not null default 'ST' check(voucher_prefix~'^[A-Za-z0-9-]{1,10}$'),add currency text not null default 'INR' check(currency='INR'),add timezone text not null default 'Asia/Kolkata' check(timezone='Asia/Kolkata'),add unique(org_id);
drop policy tenant_insert on public.settings;
drop policy tenant_update on public.settings;
create policy admin_insert on public.settings for insert to authenticated with check(org_id=public.current_org() and public.is_admin());
create policy admin_update on public.settings for update to authenticated using(org_id=public.current_org() and public.is_admin()) with check(org_id=public.current_org() and public.is_admin());

-- Composite foreign keys prevent a record from linking another business's IDs.
do $$declare t text;c text;target text;begin
foreach t in array array['bookings','trips','invoices'] loop execute format('alter table public.%I add foreign key(org_id,client_id) references public.clients(org_id,id)',t);end loop;
foreach t in array array['bookings','trips','expenses','maintenance','fuel_logs'] loop execute format('alter table public.%I add foreign key(org_id,vehicle_id) references public.vehicles(org_id,id)',t);end loop;
foreach t in array array['bookings','trips'] loop execute format('alter table public.%I add foreign key(org_id,driver_id) references public.drivers(org_id,id)',t);end loop;
foreach t in array array['expenses','fuel_logs','invoices','documents','bookings'] loop execute format('alter table public.%I add foreign key(org_id,trip_id) references public.trips(org_id,id)',t);end loop;
foreach t in array array['trips','bookings','expenses','invoices','payments','maintenance','fuel_logs'] loop execute format('create index on public.%I(org_id,date)',t);end loop;
end $$;
alter table public.trips add foreign key(org_id,booking_id) references public.bookings(org_id,id);
alter table public.payments add foreign key(org_id,invoice_id) references public.invoices(org_id,id);
create index on public.payments(org_id,invoice_id);
create index on public.expenses(org_id,trip_id);
create index on public.trips(org_id,status,date);
create index on public.trips(org_id,client_id);
create unique index booking_conversion_once on public.trips(org_id,booking_id) where booking_id is not null;

create sequence public.voucher_number_seq;
create sequence public.invoice_number_seq;
create function public.number_record() returns trigger language plpgsql security definer set search_path=public as $$declare prefix text;begin
 if tg_table_name='trips' then select voucher_prefix into prefix from public.settings where org_id=new.org_id;new.name:=coalesce(prefix,'ST')||'-'||lpad(nextval('public.voucher_number_seq')::text,7,'0');
 else select invoice_prefix into prefix from public.settings where org_id=new.org_id;new.name:=coalesce(prefix,'INV')||'-'||lpad(nextval('public.invoice_number_seq')::text,7,'0');end if;return new;end $$;
create trigger assign_voucher before insert on public.trips for each row execute function public.number_record();
create trigger assign_invoice before insert on public.invoices for each row execute function public.number_record();
create unique index on public.trips(org_id,name);
create unique index on public.invoices(org_id,name);

create function public.validate_invoice() returns trigger language plpgsql set search_path=public as $$declare item jsonb;subtotal numeric:=0;computed numeric;trip_client uuid;begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-array['status','updated_at']) is distinct from (to_jsonb(old)-array['status','updated_at']) then raise exception 'Issued invoices cannot be edited; cancel and replace.';end if;
  if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Cancelled invoices cannot be reissued.';end if;
  if new.status='cancelled' and exists(select 1 from public.payments where invoice_id=old.id group by invoice_id having sum(case when kind='refund' then -amount_minor else amount_minor end)<>0) then raise exception 'Refund payments before cancelling.';end if;
 end if;
 if new.trip_id is not null then select client_id into trip_client from public.trips where id=new.trip_id and org_id=new.org_id;if trip_client is distinct from new.client_id then raise exception 'Invoice client must match the linked trip.';end if;end if;
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items)=0 or jsonb_array_length(new.items)>100 then raise exception 'An invoice needs 1 to 100 line items.';end if;
 for item in select * from jsonb_array_elements(new.items) loop
 if coalesce(length(trim(item->>'description')),0)=0 or coalesce((item->>'quantity')::numeric,0)<=0 or (item->>'unit_minor') is null or (item->>'unit_minor')::numeric<0 or (item->>'unit_minor')::numeric<>trunc((item->>'unit_minor')::numeric) then raise exception 'Invalid invoice line item.';end if;
 subtotal:=subtotal+round((item->>'quantity')::numeric*(item->>'unit_minor')::numeric);
 end loop;
 if new.discount_minor>subtotal then raise exception 'Discount exceeds subtotal.';end if;
 computed:=subtotal-new.discount_minor+round((subtotal-new.discount_minor)*new.tax_bps/10000);
 new.total_minor:=computed;return new;
end $$;
create trigger validate_invoice_before before insert or update on public.invoices for each row execute function public.validate_invoice();
create function public.validate_payment() returns trigger language plpgsql set search_path=public as $$declare inv public.invoices;paid bigint;begin
 select * into inv from public.invoices where id=new.invoice_id and org_id=new.org_id for update;
 if not found or inv.status<>'issued' then raise exception 'Choose an issued invoice.';end if;
 select coalesce(sum(case when kind='refund' then -amount_minor else amount_minor end),0) into paid from public.payments where invoice_id=inv.id;
 if new.kind='refund' and new.amount_minor>paid then raise exception 'Refund exceeds received amount.';end if;
 if new.kind='payment' and new.amount_minor>inv.total_minor-paid then raise exception 'Payment exceeds invoice balance.';end if;
 return new;end $$;
create trigger payment_balance_guard before insert on public.payments for each row execute function public.validate_payment();
create function public.guard_trip() returns trigger language plpgsql set search_path=public as $$declare p jsonb;previous numeric;opening numeric;closing numeric;begin
 if tg_op='UPDATE' and new.name is distinct from old.name then raise exception 'Voucher numbers cannot be changed.';end if;
 if jsonb_typeof(new.places)<>'array' or jsonb_array_length(new.places)>100 then raise exception 'Places must contain at most 100 rows.';end if;
 for p in select * from jsonb_array_elements(new.places) loop
 opening:=nullif(p->>'opening_km','')::numeric;closing:=nullif(p->>'closing_km','')::numeric;
 if opening<0 or closing<opening or (closing is not null and opening is null) or opening<previous then raise exception 'Invalid or overlapping place odometer ranges.';end if;
 if opening<new.opening_km or closing>new.closing_km then raise exception 'Place odometer readings must fit within the trip readings.';end if;
 previous:=coalesce(closing,previous);
 end loop;return new;end $$;
create trigger trip_validation before insert or update on public.trips for each row execute function public.guard_trip();

create table public.activity_logs(id bigint generated always as identity primary key,org_id uuid not null references public.organizations(id),actor_id uuid references auth.users(id),table_name text not null,record_id uuid not null,action text not null,old_record jsonb,new_record jsonb,created_at timestamptz not null default now());
alter table public.activity_logs enable row level security;
create policy admin_audit on public.activity_logs for select to authenticated using(org_id=public.current_org() and public.is_admin());
create function public.audit_record() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.activity_logs(org_id,actor_id,table_name,record_id,action,old_record,new_record) values(new.org_id,auth.uid(),tg_table_name,new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
create function public.touch_record() returns trigger language plpgsql as $$begin new.updated_at=now();if new.org_id<>old.org_id or new.id<>old.id or new.created_at<>old.created_at then raise exception 'Record ownership and identity are immutable.';end if;return new;end $$;
do $$declare t text;begin foreach t in array array['clients','vehicles','drivers','trips','bookings','expenses','invoices','payments','maintenance','fuel_logs','documents','settings'] loop
execute format('create trigger audit_change after insert or update on public.%I for each row execute function public.audit_record()',t);
execute format('create trigger touch_change before update on public.%I for each row execute function public.touch_record()',t);
end loop;end $$;

create function public.create_business(business_name text) returns uuid language plpgsql security definer set search_path=public as $$declare business uuid;begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 if length(trim(business_name)) not between 1 and 200 then raise exception 'Enter a business name.';end if;
 if exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'You already belong to a business.';end if;
 insert into public.organizations(name) values(trim(business_name)) returning id into business;
 insert into public.profiles(id,org_id,role) values(auth.uid(),business,'admin');
 insert into public.settings(org_id,name) values(business,trim(business_name));return business;end $$;

create function public.convert_booking(booking_uuid uuid) returns jsonb language plpgsql set search_path=public as $$declare b public.bookings;t public.trips;begin
 select * into b from public.bookings where id=booking_uuid and org_id=public.current_org() for update;
 if not found or b.archived or b.status='cancelled' then raise exception 'Booking unavailable.';end if;
 if b.trip_id is not null then select * into t from public.trips where id=b.trip_id;return to_jsonb(t);end if;
 insert into public.trips(org_id,date,client_id,vehicle_id,driver_id,booking_id,origin,destination,passengers,status,notes) values(b.org_id,b.date,b.client_id,b.vehicle_id,b.driver_id,b.id,b.origin,b.destination,b.passengers,'draft',b.notes) returning * into t;
 update public.bookings set trip_id=t.id where id=b.id;return to_jsonb(t);end $$;

-- Bounded date-filtered reports. No silent truncation; narrow a range exceeding the cap.
create function public.invoice_balances(invoice_ids uuid[]) returns table(id uuid,paid_minor bigint,balance_minor bigint) language sql stable set search_path=public as $$
 select i.id,coalesce(sum(case when p.kind='refund' then -p.amount_minor else p.amount_minor end),0)::bigint,(i.total_minor-coalesce(sum(case when p.kind='refund' then -p.amount_minor else p.amount_minor end),0))::bigint
 from public.invoices i left join public.payments p on p.invoice_id=i.id and p.org_id=i.org_id where i.org_id=public.current_org() and i.id=any(invoice_ids) and cardinality(invoice_ids)<=100 group by i.id,i.total_minor
$$;
create function public.report_data(date_from date,date_to date) returns jsonb language plpgsql set search_path=public as $$declare result jsonb:='{}';t text;rows jsonb;n integer;begin
 if public.current_org() is null then raise exception 'Not authorized.';end if;
 if date_from is null or date_to is null or date_from>date_to then raise exception 'Invalid date range.';end if;
 foreach t in array array['trips','expenses','invoices','payments','maintenance','fuel_logs'] loop
 execute format('select count(*) from (select id from public.%I where org_id=public.current_org() and not archived and date between $1 and $2 limit 2001) limited',t) into n using date_from,date_to;
 if n>2000 then raise exception 'More than 2,000 % records. Narrow the date range.',t;end if;
 execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from (select * from public.%I where org_id=public.current_org() and not archived and date between $1 and $2 order by date) x',t) into rows using date_from,date_to;
 result:=result||jsonb_build_object(t,rows);end loop;
 select coalesce(jsonb_agg(p),'[]'::jsonb) into rows from public.payments p where p.org_id=public.current_org() and p.invoice_id in(select i.id from public.invoices i where i.org_id=public.current_org() and i.date between date_from and date_to);
 result:=result||jsonb_build_object('all_payments',rows);return result;end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documents','documents',false,10485760,array['image/jpeg','image/png','application/pdf']);
create policy tenant_file_read on storage.objects for select to authenticated using(bucket_id='documents' and (storage.foldername(name))[1]=public.current_org()::text);
create policy tenant_file_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and (storage.foldername(name))[1]=public.current_org()::text);
create policy tenant_file_remove on storage.objects for delete to authenticated using(bucket_id='documents' and (storage.foldername(name))[1]=public.current_org()::text);
alter table public.documents add constraint tenant_document_path check(split_part(path,'/',1)=org_id::text);
-- Explicit grants: no deletes of business records, no profile self-promotion.
revoke all on all tables in schema public from anon;
revoke all on public.organizations,public.profiles,public.activity_logs from authenticated;
grant select on public.organizations,public.profiles,public.activity_logs to authenticated;
do $$declare t text;begin foreach t in array array['clients','vehicles','drivers','bookings','trips','expenses','fuel_logs','maintenance','invoices','payments','documents','settings'] loop execute format('grant select,insert,update on public.%I to authenticated',t);execute format('revoke delete on public.%I from authenticated',t);end loop;end $$;
revoke update on public.payments from authenticated;
revoke execute on all functions in schema public from public,anon;
grant execute on function public.current_org(),public.is_admin(),public.create_business(text),public.convert_booking(uuid),public.report_data(date,date),public.invoice_balances(uuid[]) to authenticated;
commit;
