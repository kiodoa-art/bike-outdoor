// map.js — Leaflet color map with three separate layers:
// planned GPX route, actual ridden track, and current position marker.
// Tile loading never blocks GPS collection; tracking still works if map tiles fail.

export function createRideMap(elementId) {
  let map = null;
  let trackLine = null;
  let plannedRouteLine = null;
  let positionMarker = null;
  let startMarker = null;
  let finishMarker = null;
  let autoFollow = true;
  let ready = false;
  let lastPosition = null;

  function init() {
    if (typeof L === 'undefined') return; // Leaflet failed to load (offline first run)

    map = L.map(elementId, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    }).setView([55.6761, 12.5683], 14);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    plannedRouteLine = L.polyline([], {
      color: '#8b5cf6',
      weight: 7,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    trackLine = L.polyline([], {
      color: '#00a7ff',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    const currentDot = L.divIcon({
      className: 'ride-marker-current',
      html: '<span></span>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    positionMarker = L.marker([55.6761, 12.5683], { icon: currentDot }).addTo(map);

    map.on('dragstart zoomstart', () => { autoFollow = false; });
    ready = true;
  }

  function makePin(className, label) {
    return L.divIcon({
      className,
      html: `<span>${label}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function setPosition(lat, lon) {
    if (!ready || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    lastPosition = [lat, lon];
    positionMarker.setLatLng(lastPosition);
    if (autoFollow) map.panTo(lastPosition, { animate: true });
  }

  function addTrackPoint(lat, lon) {
    if (!ready || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const point = [lat, lon];
    trackLine.addLatLng(point);
    setPosition(lat, lon);
  }

  function loadTrackPoints(points = []) {
    if (!ready) return;
    const latlngs = points
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map(p => [p.lat, p.lon]);
    trackLine.setLatLngs(latlngs);
    if (latlngs.length) {
      const last = latlngs[latlngs.length - 1];
      positionMarker.setLatLng(last);
      map.setView(last, 15);
    }
  }

  function clearTrack() {
    if (!ready) return;
    trackLine.setLatLngs([]);
  }

  function setPlannedRoute(route) {
    if (!ready || !route?.points?.length) return;
    const latlngs = route.points.map(p => [p.lat, p.lon]);
    plannedRouteLine.setLatLngs(latlngs);

    if (startMarker) map.removeLayer(startMarker);
    if (finishMarker) map.removeLayer(finishMarker);

    startMarker = L.marker(latlngs[0], { icon: makePin('route-pin route-pin-start', 'S') }).addTo(map);
    finishMarker = L.marker(latlngs[latlngs.length - 1], { icon: makePin('route-pin route-pin-finish', 'M') }).addTo(map);

    fitPlannedRoute();
  }

  function clearPlannedRoute() {
    if (!ready) return;
    plannedRouteLine.setLatLngs([]);
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (finishMarker) { map.removeLayer(finishMarker); finishMarker = null; }
  }

  function fitPlannedRoute() {
    if (!ready) return;
    const routeLatLngs = plannedRouteLine.getLatLngs();
    if (routeLatLngs.length) {
      map.fitBounds(L.latLngBounds(routeLatLngs), { padding: [30, 30], maxZoom: 16 });
      return;
    }
    const trackLatLngs = trackLine.getLatLngs();
    if (trackLatLngs.length) map.fitBounds(L.latLngBounds(trackLatLngs), { padding: [30, 30], maxZoom: 16 });
  }

  function recenter() {
    if (!ready) return;
    autoFollow = true;
    if (lastPosition) map.setView(lastPosition, Math.max(map.getZoom(), 15));
  }

  function invalidateSize() {
    if (ready) map.invalidateSize();
  }

  return {
    init,
    setPosition,
    addTrackPoint,
    loadTrackPoints,
    clearTrack,
    setPlannedRoute,
    clearPlannedRoute,
    fitPlannedRoute,
    recenter,
    invalidateSize,
    isReady: () => ready
  };
}
