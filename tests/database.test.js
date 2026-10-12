import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
test("PostgreSQL migration and adversarial tenant / financial checks", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth,storage to authenticated;grant execute on function auth.uid() to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  const migration = (
    await readFile(
      new URL("../supabase/migrations/001_core.sql", import.meta.url),
      "utf8",
    )
  ).replace(
    "create extension if not exists pgcrypto;",
    "-- gen_random_uuid is built in to this PostgreSQL test runtime.",
  );
  await db.exec(migration);
  await db.exec(await readFile(new URL('../supabase/migrations/002_ai.sql',import.meta.url),'utf8'));
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  async function as(user) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
  }
  await as(a);
  const orgA = (await db.query("select public.create_business('A Fleet') id"))
    .rows[0].id;
  const clientA = (
    await db.query(
      "insert into clients(org_id,name) values($1,$2) returning id",
      [orgA, "A client"],
    )
  ).rows[0].id;
  for(let n=0;n<30;n++) await db.query('select consume_ai_request()');
  await assert.rejects(db.query('select consume_ai_request()'),/Hourly AI limit/);
  await assert.rejects(db.query('update ai_usage set requests=0'),/permission denied/);
  const invoiceA = (
    await db.query(
      "insert into invoices(org_id,client_id,date,due_date,items,total_minor,discount_minor,tax_bps) values($1,$2,'2026-10-12','2026-10-12',$3,1,10000,1800) returning *",
      [
        orgA,
        clientA,
        JSON.stringify([
          { description: "163 km", quantity: 163, unit_minor: 1800 },
        ]),
      ],
    )
  ).rows[0];
  assert.equal(Number(invoiceA.total_minor), 334412);
  assert.match(invoiceA.name, /INV-/);
  await db.query(
    "insert into payments(name,org_id,invoice_id,date,amount_minor,kind,method) values('Test payment',$1,$2,'2026-10-12',100000,'payment','UPI')",
    [orgA, invoiceA.id],
  );
  await assert.rejects(
    db.query(
      "insert into payments(name,org_id,invoice_id,date,amount_minor,kind,method) values('Test payment',$1,$2,'2026-10-12',300000,'payment','UPI')",
      [orgA, invoiceA.id],
    ),
    /exceeds/,
  );
  await assert.rejects(
    db.query("update invoices set status='cancelled' where id=$1", [
      invoiceA.id,
    ]),
    /Refund/,
  );
  await assert.rejects(
    db.query("update invoices set total_minor=1 where id=$1", [invoiceA.id]),
    /cannot be edited/,
  );
  await assert.rejects(
    db.exec("update payments set amount_minor=1"),
    /permission denied/,
  );
  await db.query(
    "insert into payments(name,org_id,invoice_id,date,amount_minor,kind,method) values('Test payment',$1,$2,'2026-10-12',234412,'payment','UPI')",
    [orgA, invoiceA.id],
  );
  const report = (
    await db.query("select report_data('2026-10-01','2026-10-31') data")
  ).rows[0].data;
  assert.equal(
    report.all_payments.reduce((s, p) => s + Number(p.amount_minor), 0),
    334412,
  );
  const balance = (
    await db.query("select * from invoice_balances($1)", [[invoiceA.id]])
  ).rows[0];
  assert.equal(Number(balance.paid_minor), 334412);
  assert.equal(Number(balance.balance_minor), 0);
  const requestKey = "33333333-3333-4333-8333-333333333333";
  await db.query(
    "insert into clients(org_id,name,request_key) values($1,$2,$3)",
    [orgA, "Duplicate submission test", requestKey],
  );
  await assert.rejects(
    db.query("insert into clients(org_id,name,request_key) values($1,$2,$3)", [
      orgA,
      "Duplicate submission test",
      requestKey,
    ]),
    /unique constraint/,
  );
  await as(b);
  const orgB = (await db.query("select public.create_business('B Fleet') id"))
    .rows[0].id;
  assert.equal((await db.query("select * from clients")).rows.length, 0);
  assert.equal(
    (await db.query("select * from invoice_balances($1)", [[invoiceA.id]])).rows
      .length,
    0,
  );
  await assert.rejects(
    db.query("insert into clients(org_id,name) values($1,$2)", [
      orgA,
      "Intruder",
    ]),
    /row-level security/,
  );
  await assert.rejects(
    db.query(
      "insert into invoices(org_id,client_id,date,due_date,items,total_minor) values($1,$2,'2026-10-12','2026-10-12',$3,100)",
      [
        orgB,
        clientA,
        JSON.stringify([
          { description: "Cross tenant", quantity: 1, unit_minor: 100 },
        ]),
      ],
    ),
    /foreign key/,
  );
  await assert.rejects(
    db.exec("update profiles set role='admin'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("delete from clients where id=$1", [clientA]),
    /permission denied/,
  );
  assert.equal(
    (await db.query("select report_data('2026-10-01','2026-10-31') data"))
      .rows[0].data.invoices.length,
    0,
  );
  await as(a);
  const booking = (
    await db.query(
      "insert into bookings(org_id,name,client_id,date,origin,destination) values($1,'Test booking',$2,'2026-10-12','A','B') returning id",
      [orgA, clientA],
    )
  ).rows[0].id;
  const trip1 = (await db.query("select convert_booking($1) trip", [booking]))
    .rows[0].trip;
  const trip2 = (await db.query("select convert_booking($1) trip", [booking]))
    .rows[0].trip;
  assert.equal(trip1.id, trip2.id);
  await assert.rejects(
    db.query("update trips set opening_km=200,closing_km=100 where id=$1", [
      trip1.id,
    ]),
    /reading_order/,
  );
  await assert.rejects(
    db.query("update trips set status='completed' where id=$1", [trip1.id]),
    /check constraint/,
  );
  await db.exec("reset role");
  await db.query("update profiles set role='driver' where id=$1", [b]);
  await as(b);
  assert.equal((await db.query("select * from invoices")).rows.length, 0);
  await assert.rejects(db.query('select consume_ai_request()'),/Office access/);
  await assert.rejects(
    db.query("select report_data('2026-10-01','2026-10-31')"),
    /Not authorized/,
  );
  await db.close();
});
