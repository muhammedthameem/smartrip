import { useEffect, useRef, useState } from "react";

/**
 * Live ride tracking (browser Geolocation watchPosition).
 * - Filters noisy / inaccurate fixes and impossible jumps
 * - Persists the running distance per trip in localStorage, so a reload continues the count
 * - Calls onSync(km) periodically so the server can store gps_estimated_km
 * - Keeps the screen awake while tracking (where supported) so the browser keeps sending GPS
 */

const KEY = (tripId) => `smarttrip-track-${tripId}`;
const MAX_ACCURACY_M = 80; // ignore fixes worse than this
const MIN_STEP_M = 25; // ignore jitter smaller than this
const MAX_SPEED_KMH = 160; // ignore teleport jumps

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function loadTrack(tripId) {
  try {
    return JSON.parse(localStorage.getItem(KEY(tripId))) || { distanceKm: 0, points: 0, last: null };
  } catch {
    return { distanceKm: 0, points: 0, last: null };
  }
}

export function saveTrack(tripId, track) {
  try {
    localStorage.setItem(KEY(tripId), JSON.stringify(track));
  } catch {}
}

export function startTrack(tripId, firstFix = null) {
  const track = {
    distanceKm: 0,
    points: firstFix ? 1 : 0,
    startedAt: new Date().toISOString(),
    start: firstFix,
    last: firstFix,
  };
  saveTrack(tripId, track);
  return track;
}

export function clearTrack(tripId) {
  try {
    localStorage.removeItem(KEY(tripId));
  } catch {}
}

export function useRideTracker({ tripId, active, onSync }) {
  const syncRef = useRef(onSync);
  syncRef.current = onSync;

  const [state, setState] = useState(() => {
    const t = tripId ? loadTrack(tripId) : null;
    return {
      status: "idle", // idle | starting | live | weak | denied | error | unsupported
      distanceKm: t?.distanceKm || 0,
      last: t?.last || null,
      error: "",
    };
  });

  useEffect(() => {
    if (!active || !tripId) {
      setState((s) => ({ ...s, status: "idle" }));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, status: "unsupported", error: "GPS is not available on this device." }));
      return;
    }

    let track = loadTrack(tripId);
    let lastSyncAt = Date.now();
    let lastSyncedKm = track.distanceKm || 0;
    let wakeLock = null;

    setState({ status: "starting", distanceKm: track.distanceKm || 0, last: track.last, error: "" });

    const requestWake = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    };
    requestWake();
    const onVisible = () => document.visibilityState === "visible" && requestWake();
    document.addEventListener("visibilitychange", onVisible);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy || 0),
          t: pos.timestamp || Date.now(),
        };

        if (fix.acc > MAX_ACCURACY_M) {
          setState((s) => ({ ...s, status: "weak", error: "" }));
          return;
        }

        const prev = track.last;
        if (prev) {
          const km = haversineKm(prev, fix);
          const hours = Math.max((fix.t - prev.t) / 3600000, 1 / 3600);
          if (km * 1000 < Math.max(MIN_STEP_M, fix.acc / 2)) {
            // Not moved enough — just refresh status
            setState((s) => ({ ...s, status: "live", last: { ...prev, acc: fix.acc, t: fix.t } }));
            return;
          }
          if (km / hours > MAX_SPEED_KMH) return; // GPS jump
          track.distanceKm = (track.distanceKm || 0) + km;
        } else {
          track.start = track.start || fix;
          track.startedAt = track.startedAt || new Date(fix.t).toISOString();
        }

        track.last = fix;
        track.points = (track.points || 0) + 1;
        saveTrack(tripId, track);
        setState({ status: "live", distanceKm: track.distanceKm, last: fix, error: "" });

        const movedSinceSync = track.distanceKm - lastSyncedKm;
        if (syncRef.current && (movedSinceSync >= 0.5 || (movedSinceSync > 0 && Date.now() - lastSyncAt > 120000))) {
          lastSyncAt = Date.now();
          lastSyncedKm = track.distanceKm;
          Promise.resolve(syncRef.current(Math.round(track.distanceKm * 10) / 10, fix)).catch(() => {});
        }
      },
      (err) => {
        setState((s) => ({
          ...s,
          status: err.code === 1 ? "denied" : "error",
          error:
            err.code === 1
              ? "Location permission is blocked. Allow location for this site to track the ride."
              : err.code === 3
                ? "Waiting for GPS signal…"
                : "GPS unavailable. Turn on device location.",
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        wakeLock?.release();
      } catch {}
    };
  }, [tripId, active]);

  return state;
}
