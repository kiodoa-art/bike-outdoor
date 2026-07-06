// export.js — Builds a ride JSON compatible with the Training app's Bike ride
// import (bike-json.js: bikeRideToActivity / sanitizeRideSamples), and triggers a download.
//
// Training app REQUIRED shape (from TrainingV2 bike-json.js):
//   { version: 1, source, rideId, startTime, endTime, summary:{...}, samples:[{t, timestamp, power, heartRate, cadence, speedKmh, distanceKm}, ...] }
//
// This export adds outdoor-only fields (sport, movingTimeSec, elevationGainMeters, laps,
// and per-sample lat/lon/altitude/gpsAccuracy/isPaused). The Training app's importer only reads
// the keys it knows about and ignores the rest, so this is backwards compatible. See the
// accompanying patched bike-json.js for the one-line change that lets "sport" flow through
// instead of always forcing "indoor_cycling".

function pad(n) { return String(n).padStart(2, '0'); }

export function buildFilename(startTime) {
  const d = new Date(startTime);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `ride-${stamp}-outdoor.json`;
}

function round(value, decimals = 0) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildRideJson(ride) {
  const { rideId, startTime, endTime, durationSec, movingTimeSec, distanceMeters, elevationGainMeters, samples, laps } = ride;

  const powers = samples.map(s => s.power).filter(Number.isFinite);
  const hrs = samples.map(s => s.heartRate).filter(Number.isFinite);
  const cadences = samples.map(s => s.cadence).filter(Number.isFinite);
  const speeds = samples.map(s => s.speedKmh).filter(Number.isFinite);

  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const max = (arr) => arr.length ? Math.max(...arr) : null;

  const distanceKm = round(distanceMeters / 1000, 3);

  const summary = {
    durationSec: round(durationSec),
    distanceKm,
    avgPower: round(avg(powers)),
    maxPower: round(max(powers)),
    normalizedPower: null,
    avgHeartRate: round(avg(hrs)),
    maxHeartRate: round(max(hrs)),
    avgCadence: round(avg(cadences)),
    maxCadence: round(max(cadences)),
    avgSpeedKmh: round(avg(speeds), 1),
    maxSpeedKmh: round(max(speeds), 1)
  };

  return {
    version: 1,
    source: 'bike_outdoor',
    sport: 'outdoor_cycling',
    rideId,
    startTime,
    endTime,
    durationSec: round(durationSec),
    movingTimeSec: round(movingTimeSec),
    distanceMeters: round(distanceMeters),
    elevationGainMeters: round(elevationGainMeters),
    summary,
    laps: laps || [],
    samples: samples.map(s => ({
      t: s.t,
      timestamp: s.timestamp,
      power: Number.isFinite(s.power) ? s.power : null,
      heartRate: Number.isFinite(s.heartRate) ? s.heartRate : null,
      cadence: Number.isFinite(s.cadence) ? s.cadence : null,
      speedKmh: Number.isFinite(s.speedKmh) ? s.speedKmh : null,
      distanceKm: Number.isFinite(s.distanceMeters) ? round(s.distanceMeters / 1000, 4) : null,
      lat: Number.isFinite(s.lat) ? s.lat : null,
      lon: Number.isFinite(s.lon) ? s.lon : null,
      altitude: Number.isFinite(s.altitude) ? s.altitude : null,
      gpsAccuracy: Number.isFinite(s.gpsAccuracy) ? s.gpsAccuracy : null,
      isPaused: !!s.isPaused
    }))
  };
}

export function downloadRideJson(rideJson) {
  const filename = buildFilename(rideJson.startTime);
  const blob = new Blob([JSON.stringify(rideJson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}
