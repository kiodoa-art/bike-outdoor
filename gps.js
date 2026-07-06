// gps.js — Geolocation tracking, distance/speed/elevation calculation.

const EARTH_RADIUS_M = 6371000;
const MIN_ACCURACY_M = 30;      // ignore fixes worse than this for distance accumulation
const MIN_ELEVATION_DELTA_M = 1.5; // ignore small elevation jitter
const MIN_MOVE_DISTANCE_M = 1;  // ignore GPS jitter smaller than this between fixes

function toRad(deg) { return (deg * Math.PI) / 180; }

function haversineDistance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function createGpsTracker({ onFix, onStateChange }) {
  let watchId = null;
  let lastPoint = null;
  let totalDistanceM = 0;
  let elevationGainM = 0;
  let lastElevation = null;

  function start() {
    if (!('geolocation' in navigator)) {
      onStateChange('error', 'Geolocation understøttes ikke');
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    onStateChange('searching');
    watchId = navigator.geolocation.watchPosition(
      (position) => handleFix(position),
      (err) => onStateChange('error', err.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }

  function handleFix(position) {
    const { latitude: lat, longitude: lon, altitude, accuracy, speed, heading } = position.coords;
    const timestamp = position.timestamp;

    let deltaDistanceM = 0;
    if (lastPoint && accuracy <= MIN_ACCURACY_M) {
      const d = haversineDistance(lastPoint, { lat, lon });
      if (d >= MIN_MOVE_DISTANCE_M) {
        deltaDistanceM = d;
        totalDistanceM += d;
      }
    }

    if (Number.isFinite(altitude)) {
      if (lastElevation !== null) {
        const delta = altitude - lastElevation;
        if (delta > MIN_ELEVATION_DELTA_M) elevationGainM += delta;
      }
      lastElevation = altitude;
    }

    if (accuracy <= MIN_ACCURACY_M) lastPoint = { lat, lon };
    onStateChange(lastPoint ? 'locked' : 'searching');

    onFix({
      lat, lon,
      altitude: Number.isFinite(altitude) ? altitude : null,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      speedMs: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(heading) ? heading : null,
      timestamp,
      deltaDistanceM,
      totalDistanceM,
      elevationGainM
    });
  }

  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function reset() {
    lastPoint = null;
    totalDistanceM = 0;
    elevationGainM = 0;
    lastElevation = null;
  }

  function restoreTotals({ distanceM, elevationGainM: elev }) {
    if (Number.isFinite(distanceM)) totalDistanceM = distanceM;
    if (Number.isFinite(elev)) elevationGainM = elev;
  }

  return { start, stop, reset, restoreTotals };
}
