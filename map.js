// map.js — Leaflet color map, route polyline, position marker, recenter control.
// Tile tracking never blocks GPS point collection: if tiles fail to load (offline),
// the app keeps recording route points regardless.

export function createRideMap(elementId) {
  let map = null;
  let polyline = null;
  let marker = null;
  let autoFollow = true;
  let ready = false;

  function init() {
    if (typeof L === 'undefined') return; // Leaflet failed to load (offline first run)
    map = L.map(elementId, { zoomControl: false, attributionControl: true })
      .setView([55.6761, 12.5683], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    polyline = L.polyline([], { color: '#006dff', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);

    const dot = L.divIcon({
      className: 'ride-marker',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#006dff;box-shadow:0 0 0 5px rgba(0,109,255,0.22),0 0 16px 4px rgba(0,109,255,0.55);border:3px solid #ffffff;"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    marker = L.marker([55.6761, 12.5683], { icon: dot }).addTo(map);

    map.on('dragstart', () => { autoFollow = false; });
    ready = true;
  }

  function addPoint(lat, lon) {
    if (!ready) return;
    polyline.addLatLng([lat, lon]);
    marker.setLatLng([lat, lon]);
    if (autoFollow) map.panTo([lat, lon], { animate: true });
  }

  function recenter() {
    if (!ready) return;
    autoFollow = true;
    const latlngs = polyline.getLatLngs();
    if (latlngs.length) map.setView(latlngs[latlngs.length - 1], Math.max(map.getZoom(), 15));
  }

  function invalidateSize() {
    if (ready) map.invalidateSize();
  }

  function loadPoints(points) {
    if (!ready || !points.length) return;
    const latlngs = points.map(p => [p.lat, p.lon]);
    polyline.setLatLngs(latlngs);
    const last = latlngs[latlngs.length - 1];
    marker.setLatLng(last);
    map.setView(last, 15);
  }

  return { init, addPoint, recenter, invalidateSize, loadPoints, isReady: () => ready };
}
