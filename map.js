export class RideMap {
  constructor(container, canvas, emptyState) {
    this.container = container;
    this.canvas = canvas;
    this.emptyState = emptyState;
    this.points = [];
    this.follow = true;
    this.map = null;
    this.polyline = null;
    this.marker = null;
    this.finishMarker = null;
    this.tileLayer = null;
    this.layerIndex = 0;
    this.layers = [
      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', options: { maxZoom: 20, subdomains: 'abcd' } },
      { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', options: { maxZoom: 20, subdomains: 'abcd' } }
    ];
    this.initialize();
  }

  initialize() {
    if (!window.L) { this.resizeFallback(); return; }
    this.canvas.hidden = true;
    this.map = L.map(this.container, { zoomControl: false, attributionControl: false, preferCanvas: true }).setView([55.6761, 12.5683], 13);
    this.tileLayer = L.tileLayer(this.layers[this.layerIndex].url, this.layers[this.layerIndex].options).addTo(this.map);
    this.polyline = L.polyline([], {
      color: '#19a7ff',
      weight: 6,
      opacity: .96,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(this.map);
    const currentIcon = L.divIcon({ className: '', html: '<div class="route-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    const finishIcon = L.divIcon({ className: '', html: '<div class="route-finish-marker">⚑</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
    this.marker = L.marker([0, 0], { icon: currentIcon, interactive: false });
    this.finishMarker = L.marker([0, 0], { icon: finishIcon, interactive: false });
    this.map.on('dragstart zoomstart', () => { this.follow = false; });
  }

  addPoint(point) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return;
    this.points.push(point);
    this.emptyState.hidden = true;
    if (this.map) {
      const latLng = [point.lat, point.lon];
      this.polyline.addLatLng(latLng);
      this.marker.setLatLng(latLng).addTo(this.map);
      if (this.points.length === 1) this.finishMarker.setLatLng(latLng).addTo(this.map);
      if (this.follow) this.map.setView(latLng, Math.max(this.map.getZoom(), 15), { animate: true });
    } else {
      this.drawFallback();
    }
  }

  setRoute(points) {
    this.points = [];
    if (this.map) {
      this.polyline.setLatLngs([]);
      this.marker.remove();
      this.finishMarker.remove();
    }
    for (const point of points || []) this.addPoint(point);
  }

  recenter() {
    this.follow = true;
    const point = this.points.at(-1);
    if (point && this.map) this.map.setView([point.lat, point.lon], Math.max(this.map.getZoom(), 15), { animate: true });
    else this.drawFallback();
  }

  zoomIn() { this.map?.zoomIn(); }
  zoomOut() { this.map?.zoomOut(); }

  cycleLayer() {
    if (!this.map || !this.tileLayer) return;
    this.layerIndex = (this.layerIndex + 1) % this.layers.length;
    this.map.removeLayer(this.tileLayer);
    this.tileLayer = L.tileLayer(this.layers[this.layerIndex].url, this.layers[this.layerIndex].options).addTo(this.map);
  }

  show() { setTimeout(() => { this.map?.invalidateSize(); this.resizeFallback(); }, 50); }

  resizeFallback() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    this.drawFallback();
  }

  drawFallback() {
    if (this.map) return;
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#081018';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#17232b';
    ctx.lineWidth = 1;
    for (let x = 20; x < w; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 25, h); ctx.stroke(); }
    for (let y = 25; y < h; y += 55) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + 15); ctx.stroke(); }
    if (this.points.length < 2) return;

    const lats = this.points.map(p => p.lat), lons = this.points.map(p => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const project = p => ({
      x: 30 + (p.lon - minLon) / (maxLon - minLon || .00001) * (w - 60),
      y: h - 30 - (p.lat - minLat) / (maxLat - minLat || .00001) * (h - 90)
    });

    ctx.shadowColor = '#149fff';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#19a7ff';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.points.forEach((p, i) => { const q = project(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.stroke();

    const current = project(this.points.at(-1));
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#168fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(current.x, current.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
