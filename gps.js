export function haversineMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function normalizePosition(position, previous = null) {
  const { coords } = position;
  const timestamp = new Date(position.timestamp || Date.now()).toISOString();
  let speedKmh = Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed * 3.6 : null;
  if (speedKmh === null && previous) {
    const seconds = (Date.parse(timestamp) - Date.parse(previous.timestamp)) / 1000;
    if (seconds > 0) speedKmh = Math.min(120, haversineMeters(previous, { lat: coords.latitude, lon: coords.longitude }) / seconds * 3.6);
  }
  return {
    timestamp, lat: coords.latitude, lon: coords.longitude,
    altitude: Number.isFinite(coords.altitude) ? coords.altitude : null,
    accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    heading: Number.isFinite(coords.heading) ? coords.heading : null,
    speedKmh
  };
}

export class GPSTracker extends EventTarget {
  watchId = null;
  latest = null;
  status = 'searching';

  start() {
    if (!navigator.geolocation) {
      this.status = 'error';
      this.dispatchEvent(new CustomEvent('status', { detail: { status: this.status, message: 'GPS understøttes ikke' } }));
      return;
    }
    if (this.watchId !== null) return;
    this.status = 'searching';
    this.dispatchEvent(new CustomEvent('status', { detail: { status: this.status } }));
    this.watchId = navigator.geolocation.watchPosition(
      position => {
        this.latest = normalizePosition(position, this.latest);
        this.status = 'on';
        this.dispatchEvent(new CustomEvent('position', { detail: this.latest }));
        this.dispatchEvent(new CustomEvent('status', { detail: { status: 'on', accuracy: this.latest.accuracy } }));
      },
      error => {
        this.status = error.code === 1 ? 'error' : 'searching';
        this.dispatchEvent(new CustomEvent('status', { detail: { status: this.status, message: error.message } }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}
