import test from "node:test";
import assert from "node:assert/strict";
import { repository } from "../src/lib/repository.js";
import { searchPlaces, calculateDistanceKm } from "../src/lib/location.js";
import { minor, distance } from "../src/lib/calculations.js";

test("Driver Trip: assigned multi-day package retrieval and day progress", async () => {
  const repo = repository(true, null);
  const trip = await repo.getAssignedDriverTrip("d1");

  assert.ok(trip, "Driver should have an assigned trip");
  assert.equal(trip.package_name, "7-Day Kerala Package");
  assert.equal(trip.days.length, 7, "Package should contain 7 itinerary days");
  assert.equal(trip.days[0].status, "completed");
  assert.equal(trip.days[1].status, "in progress");
});

test("Driver Trip: previous day closing KM suggests next opening KM", async () => {
  const repo = repository(true, null);
  const days = await repo.getTripDays("t4");

  const day1 = days.find((d) => d.day_number === 1);
  const day2 = days.find((d) => d.day_number === 2);

  assert.equal(day1.closing_km, 45250, "Day 1 closing reading is 45,250 km");
  assert.equal(day2.opening_km, 45250, "Day 2 opening reading is seeded from Day 1 closing");
});

test("Driver Trip: day lifecycle, distance calculation and closing validation", async () => {
  const repo = repository(true, null);
  const days = await repo.getTripDays("t4");
  const day3 = days.find((d) => d.day_number === 3);

  // 1. Start Day 3
  const started = await repo.startTripDay(day3.id, {
    opening_km: 45486,
    opening_source: "previous_day",
    started_at: "2026-10-20T08:00:00.000Z",
  });
  assert.equal(started.status, "in progress");
  assert.equal(started.opening_km, 45486);

  // 2. Reject closing km lower than opening km
  await assert.rejects(
    repo.endTripDay(day3.id, { closing_km: 45000 }),
    /Closing odometer must be at least the opening reading/
  );

  // 3. End Day 3 with valid reading
  const ended = await repo.endTripDay(day3.id, {
    closing_km: 45722,
    closing_source: "manual",
    ended_at: "2026-10-20T18:00:00.000Z",
  });
  assert.equal(ended.status, "completed");
  assert.equal(ended.closing_km, 45722);

  const dayDist = distance(ended.opening_km, ended.closing_km);
  assert.equal(dayDist, 236, "Day distance is closing - opening = 236 km");
});

test("Driver Trip: place events preserve factual GPS coordinates and accuracy", async () => {
  const repo = repository(true, null);

  const event = await repo.recordReachedPlace({
    trip_day_id: "td2",
    trip_id: "t4",
    name: "Alappuzha Finishing Point",
    latitude: 9.4981,
    longitude: 76.3388,
    accuracy: 14,
    location_source: "gps_reverse_geocoded",
    planned_destination: "Alappuzha",
    odometer: 45486,
    notes: "GPS accuracy ±14m",
  });

  assert.ok(event.id);
  assert.equal(event.name, "Alappuzha Finishing Point");
  assert.equal(event.latitude, 9.4981);
  assert.equal(event.longitude, 76.3388);
  assert.equal(event.accuracy, 14);
  assert.equal(event.location_source, "gps_reverse_geocoded");
});

test("Driver Trip: chronological timeline merges start, places, expenses, and completion", async () => {
  const repo = repository(true, null);
  const timeline = await repo.getTripDayTimeline("td2");

  assert.ok(timeline.length >= 3, "Timeline should contain day start, recorded stops, and expenses");
  // Ensure timeline is sorted chronologically
  for (let i = 1; i < timeline.length; i++) {
    const prevTime = new Date(timeline[i - 1].timestamp).getTime();
    const currTime = new Date(timeline[i].timestamp).getTime();
    assert.ok(currTime >= prevTime, "Timeline events must be chronologically ascending");
  }
});

test("Driver Trip: expense logging maintains integer paise financial integrity", async () => {
  const repo = repository(true, null);

  const amountPaise = minor("1250.50");
  assert.equal(amountPaise, 125050, "₹1,250.50 converts to 125,050 paise integer");

  const exp = await repo.addDriverExpense({
    trip_id: "t4",
    vehicle_id: "v4",
    name: "Highway Toll Plaza",
    category: "Toll",
    amount_minor: amountPaise,
    date: "2026-10-20",
    notes: "Fastag recharge",
  });

  assert.ok(exp.id);
  assert.equal(exp.amount_minor, 125050);
  assert.equal(exp.category, "Toll");
});

test("Location Service: autocomplete search and distance calculation", async () => {
  // Test offline/local autocomplete dictionary
  const munnarMatches = await searchPlaces("munn");
  assert.ok(munnarMatches.length > 0, "Typing 'munn' should suggest Munnar destinations");
  assert.match(munnarMatches[0].formatted, /Munnar/i);

  const alapMatches = await searchPlaces("alap");
  assert.ok(alapMatches.length > 0, "Typing 'alap' should suggest Alappuzha destinations");
  assert.match(alapMatches[0].formatted, /Alappuzha/i);

  // Test distance between Munnar (10.0889, 77.0595) and Thekkady (9.6031, 77.1615)
  const d = calculateDistanceKm(10.0889, 77.0595, 9.6031, 77.1615);
  assert.ok(d > 50 && d < 70, `Distance between Munnar and Thekkady should be ~55-65km (got ${d}km)`);
});
