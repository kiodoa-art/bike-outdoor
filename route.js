// route.js — GPX parsing and lightweight route math for following a planned route.

const EARTH_RADIUS_M = 6371000;
function toRad(deg) { return (deg * Math.PI) / 180; }

export function distanceMeters(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return 0;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function textOf(parent, selector) {
  return parent?.querySelector(selector)?.textContent?.trim() || '';
}

function readPoint(node) {
  const lat = Number.parseFloat(node.getAttribute('lat'));
  const lon = Number.parseFloat(node.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const eleText = textOf(node, 'ele');
  const timeText = textOf(node, 'time');
  return {
    lat,
    lon,
    ele: eleText ? Number.parseFloat(eleText) : null,
    time: timeText || null
  };
}

function cumulative(points) {
  const cumulativeMeters = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMeters(points[i - 1], points[i]);
    cumulativeMeters.push(total);
  }
  return { cumulativeMeters, totalDistanceMeters: total };
}

export function parseGpxRoute(gpxText, fallbackName = 'GPX-rute') {
  const doc = new DOMParser().parseFromString(gpxText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('GPX-filen kunne ikke læses');

  const gpx = doc.querySelector('gpx');
  if (!gpx) throw new Error('Filen ligner ikke en GPX-fil');

  const name = textOf(doc, 'metadata > name') || textOf(doc, 'trk > name') || textOf(doc, 'rte > name') || fallbackName;

  // Prefer tracks, then routes, then waypoints. Tracks are most common for cycling routes.
  let nodes = Array.from(doc.querySelectorAll('trkpt'));
  let type = 'track';
  if (!nodes.length) {
    nodes = Array.from(doc.querySelectorAll('rtept'));
    type = 'route';
  }
  if (!nodes.length) {
    nodes = Array.from(doc.querySelectorAll('wpt'));
    type = 'waypoints';
  }

  const points = nodes.map(readPoint).filter(Boolean);
  if (points.length < 2) throw new Error('GPX-ruten skal indeholde mindst 2 punkter');

  const { cumulativeMeters, totalDistanceMeters } = cumulative(points);
  return {
    id: `gpx-${Date.now()}`,
    name,
    type,
    importedAt: new Date().toISOString(),
    points,
    cumulativeMeters,
    totalDistanceMeters,
    pointCount: points.length
  };
}

export function makeRouteMeta(route) {
  if (!route) return null;
  return {
    name: route.name,
    type: route.type,
    importedAt: route.importedAt,
    distanceMeters: Math.round(route.totalDistanceMeters || 0),
    pointCount: route.pointCount || route.points?.length || 0
  };
}

export function getRouteStatus(route, currentLat, currentLon) {
  if (!route?.points?.length || !Number.isFinite(currentLat) || !Number.isFinite(currentLon)) {
    return null;
  }

  const current = { lat: currentLat, lon: currentLon };
  let nearestIndex = 0;
  let nearestDistanceMeters = Infinity;

  // Simple and robust. GPX routes for private cycling are typically fine at this size.
  for (let i = 0; i < route.points.length; i += 1) {
    const d = distanceMeters(current, route.points[i]);
    if (d < nearestDistanceMeters) {
      nearestDistanceMeters = d;
      nearestIndex = i;
    }
  }

  const progressed = route.cumulativeMeters?.[nearestIndex] || 0;
  const total = route.totalDistanceMeters || 0;
  const remainingMeters = Math.max(0, total - progressed);
  const progressPercent = total > 0 ? Math.min(100, Math.max(0, (progressed / total) * 100)) : 0;

  return {
    nearestIndex,
    nearestDistanceMeters,
    remainingMeters,
    progressedMeters: progressed,
    progressPercent,
    onRoute: nearestDistanceMeters <= 50
  };
}
