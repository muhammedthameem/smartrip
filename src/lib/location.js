/**
 * SmartTrip Location Service
 * Provider-agnostic abstraction for Geolocation, Reverse Geocoding, and Autocomplete Search.
 * Includes offline destination dictionary for reliable Indian tour package operations.
 */

// Curated offline locations for Kerala and South Indian tour corridors
export const OFFLINE_DESTINATIONS = [
  { name: "Munnar", formatted: "Munnar, Idukki, Kerala, India", lat: 10.0889, lng: 77.0595 },
  { name: "Munnar Town", formatted: "Munnar Town, Idukki, Kerala", lat: 10.0869, lng: 77.0601 },
  { name: "Munnar Bus Stand", formatted: "Munnar KSRTC Bus Station, Kerala", lat: 10.0833, lng: 77.0617 },
  { name: "Mattupetty Dam", formatted: "Mattupetty Dam, Munnar, Kerala", lat: 10.1062, lng: 77.1242 },
  { name: "Echo Point", formatted: "Echo Point, Munnar, Kerala", lat: 10.1256, lng: 77.1478 },
  { name: "Kundala Lake", formatted: "Kundala Dam Lake, Munnar, Kerala", lat: 10.1345, lng: 77.1732 },
  { name: "Top Station", formatted: "Top Station, Kerala-Tamil Nadu Border", lat: 10.1244, lng: 77.2439 },
  { name: "Eravikulam National Park", formatted: "Eravikulam National Park, Munnar", lat: 10.2014, lng: 77.0864 },
  { name: "Thekkady", formatted: "Thekkady, Periyar, Idukki, Kerala", lat: 9.6031, lng: 77.1615 },
  { name: "Periyar National Park", formatted: "Periyar Tiger Reserve, Thekkady, Kerala", lat: 9.4679, lng: 77.1418 },
  { name: "Kumily", formatted: "Kumily Town, Idukki, Kerala", lat: 9.6074, lng: 77.1689 },
  { name: "Alappuzha", formatted: "Alappuzha (Alleppey), Kerala, India", lat: 9.4981, lng: 76.3388 },
  { name: "Alappuzha Houseboat Jetty", formatted: "Punnamada Finishing Point, Alappuzha", lat: 9.5085, lng: 76.3533 },
  { name: "Marari Beach", formatted: "Marari Beach, Mararikulam, Alappuzha", lat: 9.6015, lng: 76.2995 },
  { name: "Kochi", formatted: "Kochi (Cochin), Ernakulam, Kerala", lat: 9.9312, lng: 76.2673 },
  { name: "Cochin Airport (COK)", formatted: "Cochin International Airport, Nedumbassery", lat: 10.1556, lng: 76.3908 },
  { name: "Fort Kochi", formatted: "Fort Kochi, Ernakulam, Kerala", lat: 9.9658, lng: 76.2421 },
  { name: "Thiruvananthapuram", formatted: "Thiruvananthapuram (Trivandrum), Kerala", lat: 8.5241, lng: 76.9366 },
  { name: "Kovalam Beach", formatted: "Kovalam Lighthouse Beach, Thiruvananthapuram", lat: 8.3988, lng: 76.9820 },
  { name: "Varkala Cliff", formatted: "North Cliff, Varkala, Kerala", lat: 8.7356, lng: 76.7032 },
  { name: "Kumarakom", formatted: "Kumarakom Bird Sanctuary, Kottayam, Kerala", lat: 9.6175, lng: 76.4301 },
  { name: "Wayanad", formatted: "Kalpetta, Wayanad, Kerala", lat: 11.6103, lng: 76.0827 },
  { name: "Athirappilly Falls", formatted: "Athirappilly Water Falls, Chalakudy, Kerala", lat: 10.2851, lng: 76.5698 },
  { name: "Vagamon", formatted: "Vagamon Pine Forest, Idukki, Kerala", lat: 9.6896, lng: 76.9056 },
  { name: "Bengaluru", formatted: "Bengaluru, Karnataka, India", lat: 12.9716, lng: 77.5946 },
  { name: "Mysuru", formatted: "Mysuru (Mysore), Karnataka, India", lat: 12.2958, lng: 76.6394 },
  { name: "Ooty", formatted: "Udhagamandalam (Ooty), Tamil Nadu", lat: 11.4102, lng: 76.6950 },
  { name: "Kodaikanal", formatted: "Kodaikanal Lake, Tamil Nadu", lat: 10.2381, lng: 77.4892 },
];

/**
 * Request device geolocation using navigator.geolocation
 */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return reject(new Error("Geolocation is not supported by your browser."));
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
      ...options,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: pos.timestamp || Date.now(),
        });
      },
      (err) => {
        let msg = "Location unavailable. Please search or enter manually.";
        if (err.code === 1) msg = "Location permission denied. You can search for the place manually.";
        else if (err.code === 2) msg = "Position unavailable. Check your device GPS settings.";
        else if (err.code === 3) msg = "Location request timed out. Please try again or search.";
        const error = new Error(msg);
        error.code = err.code;
        reject(error);
      },
      defaultOptions
    );
  });
}

/**
 * Reverse geocode coordinates to obtain a human-readable place name.
 * Uses public OpenStreetMap Nominatim with offline fallback.
 */
export async function reverseGeocode(latitude, longitude) {
  if (latitude == null || longitude == null) return null;

  // 1. Check if device is offline; if so, match nearest known destination
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const nearest = findNearestOffline(latitude, longitude);
    if (nearest && nearest.distanceKm < 15) {
      return {
        formatted: nearest.formatted,
        name: nearest.name,
        source: "offline_cache",
      };
    }
    return {
      formatted: `GPS ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      name: "Current Location",
      source: "coordinates_only",
    };
  }

  // 2. Online request with 5s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept-Language": "en-IN,en" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const primary =
        addr.tourism ||
        addr.amenity ||
        addr.suburb ||
        addr.village ||
        addr.town ||
        addr.city ||
        addr.county ||
        data.name;

      const secondary = addr.state_district || addr.state || addr.country;
      const formatted = [primary, secondary].filter(Boolean).join(", ") || data.display_name?.split(",").slice(0, 3).join(",") || "Recorded stop";

      return {
        formatted,
        name: primary || formatted.split(",")[0].trim(),
        full: data.display_name,
        source: "gps_reverse_geocoded",
      };
    }
  } catch (e) {
    // Network or timeout failed
  }

  // 3. Fallback to nearest offline match
  const nearest = findNearestOffline(latitude, longitude);
  if (nearest && nearest.distanceKm < 20) {
    return {
      formatted: nearest.formatted,
      name: nearest.name,
      source: "nearest_match",
    };
  }

  return {
    formatted: `Location near ${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    name: "Recorded Location",
    source: "coordinates_only",
  };
}

/**
 * Autocomplete search for places by query string
 */
export async function searchPlaces(query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];

  // Local matching from offline dictionary first
  const localMatches = OFFLINE_DESTINATIONS.filter(
    (item) => item.name.toLowerCase().includes(q) || item.formatted.toLowerCase().includes(q)
  ).map((item) => ({
    name: item.name,
    formatted: item.formatted,
    latitude: item.lat,
    longitude: item.lng,
    source: "offline_dictionary",
  }));

  // If offline, return local matches immediately
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return localMatches.slice(0, 8);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    // Photon (Komoot) or Nominatim geocoder
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const onlineResults = (data.features || []).map((f) => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [];
        const parts = [p.name, p.city || p.district, p.state, p.country].filter(Boolean);
        return {
          name: p.name || parts[0] || "Location",
          formatted: parts.join(", "),
          latitude: coords[1] ? Number(coords[1].toFixed(6)) : null,
          longitude: coords[0] ? Number(coords[0].toFixed(6)) : null,
          source: "search",
        };
      });

      // Merge online results with local matches, avoiding duplicates by name
      const seen = new Set();
      const combined = [];
      for (const item of [...localMatches, ...onlineResults]) {
        const key = item.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }
      return combined.slice(0, 8);
    }
  } catch {
    // If online search fails, local matches are safely returned
  }

  return localMatches.slice(0, 8);
}

/**
 * Calculate distance between two coordinates in kilometres (Haversine formula)
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Find nearest location in offline dictionary
 */
function findNearestOffline(lat, lng) {
  let best = null;
  let minD = Infinity;
  for (const dest of OFFLINE_DESTINATIONS) {
    const d = calculateDistanceKm(lat, lng, dest.lat, dest.lng);
    if (d < minD) {
      minD = d;
      best = { ...dest, distanceKm: d };
    }
  }
  return best;
}
