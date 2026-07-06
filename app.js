import { createSensorManager } from './sensors.js';
import { createGpsTracker } from './gps.js';
import { createRideMap } from './map.js';
import * as storage from './storage.js';
import * as ui from './ui.js';
import { buildRideJson, downloadRideJson } from './export.js';

const $ = (id) => document.getElementById(id);

const AUTOSAVE_INTERVAL_TICKS = 6; // ~6s at 1Hz
const AUTO_PAUSE_SPEED_KMH = 2;
const AUTO_PAUSE_TICKS = 8; // ~8s below threshold before auto-pausing

let settings = { autoDim: true, autoPause: true };

// ---------------- Ride state ----------------
function freshRide() {
  return {
    rideState: 'idle', // idle | recording | paused | stopped
    rideId: null,
    startTime: null,
    endTime: null,
    elapsedSec: 0,
    movingTimeSec: 0,
    distanceMeters: 0,
    elevationGainMeters: 0,
    currentPower: null,
    currentCadence: null,
    currentHeartRate: null,
    currentSpeedKmh: null,
    gpsAccuracy: null,
    lastLat: null,
    lastLon: null,
    avgPower: null,
    maxPower: null,
    samples: [],
    laps: [],
    routePoints: [] // {lat, lon} for map redraw on resume
  };
}

let ride = freshRide();
let tickTimer = null;
let ticksSinceAutosave = 0;
let belowSpeedTicks = 0;
let lastFixTimestamp = null;

// ---------------- Sensors ----------------
const sensors = createSensorManager({
  onPower: (w) => { ride.currentPower = w; },
  onCadence: (c) => { ride.currentCadence = c; },
  onHeartRate: (hr) => { ride.currentHeartRate = hr; },
  onPowerStateChange: (state) => {
    if (state === 'connected') ui.setStatusChip('statusPower', 'ok', 'CONNECT');
    else if (state === 'connecting') ui.setStatusChip('statusPower', 'searching', 'FORBINDER');
    else if (state === 'unsupported') ui.setStatusChip('statusPower', 'error', 'INTET BLE');
    else ui.setStatusChip('statusPower', 'off', 'FRA');
  },
  onHrStateChange: (state) => {
    if (state === 'connected') ui.setStatusChip('statusHr', 'ok', 'CONNECT');
    else if (state === 'connecting') ui.setStatusChip('statusHr', 'searching', 'FORBINDER');
    else if (state === 'unsupported') ui.setStatusChip('statusHr', 'error', 'INTET BLE');
    else ui.setStatusChip('statusHr', 'off', 'FRA');
  }
});

// ---------------- GPS ----------------
const gps = createGpsTracker({
  onFix: (fix) => {
    ride.gpsAccuracy = fix.accuracy;
    ride.lastLat = fix.lat;
    ride.lastLon = fix.lon;
    lastFixTimestamp = fix.timestamp;

    if (ride.rideState === 'recording') {
      ride.distanceMeters = fix.totalDistanceM;
      ride.elevationGainMeters = fix.elevationGainM;
      const speedMs = Number.isFinite(fix.speedMs) ? fix.speedMs : null;
      ride.currentSpeedKmh = speedMs !== null ? speedMs * 3.6 : ride.currentSpeedKmh;
      ride.routePoints.push({ lat: fix.lat, lon: fix.lon });
      if (rideMap.isReady()) rideMap.addPoint(fix.lat, fix.lon);
    } else if (rideMap.isReady()) {
      rideMap.addPoint(fix.lat, fix.lon);
    }
  },
  onStateChange: (state) => {
    if (state === 'locked') ui.setStatusChip('statusGps', 'ok', 'LÅST');
    else if (state === 'error') ui.setStatusChip('statusGps', 'error', 'FEJL');
    else ui.setStatusChip('statusGps', 'searching', 'SØGER');
  }
});

// ---------------- Map ----------------
const rideMap = createRideMap('mapEl');

// ---------------- Ride lifecycle ----------------
function startRide() {
  ride = freshRide();
  ride.rideState = 'recording';
  ride.startTime = new Date().toISOString();
  ride.rideId = `ride-${ride.startTime.replace(/[:.]/g, '-')}-outdoor`;

  document.body.dataset.rideActive = '1';
  $('startBtn').hidden = true;
  $('rideControls').hidden = false;
  setPauseButtonLabel();

  gps.reset();
  gps.start();
  ui.requestWakeLock().then((ok) => { if (!ok) ui.showToast('Wake lock ikke understøttet — skærmen kan gå i sleep'); });

  tickTimer = setInterval(tick, 1000);
  ui.showToast('Tur startet');
}

function tick() {
  if (ride.rideState === 'recording') {
    ride.elapsedSec += 1;

    const speedKmh = ride.currentSpeedKmh;
    const moving = Number.isFinite(speedKmh) ? speedKmh >= AUTO_PAUSE_SPEED_KMH : true;
    if (moving) { ride.movingTimeSec += 1; belowSpeedTicks = 0; }
    else {
      belowSpeedTicks += 1;
      if (settings.autoPause && belowSpeedTicks >= AUTO_PAUSE_TICKS) {
        pauseRide(true);
        return;
      }
    }

    recordSample(false);
  } else if (ride.rideState === 'paused') {
    // still show live sensor values but do not accumulate ride time/distance
  }

  ui.renderLive(ride);
  ui.pushSpark('Hr', ride.currentHeartRate);
  ui.pushSpark('Cadence', ride.currentCadence);
  ui.pushSpark('Speed', ride.currentSpeedKmh);

  ticksSinceAutosave += 1;
  if (ticksSinceAutosave >= AUTOSAVE_INTERVAL_TICKS) {
    ticksSinceAutosave = 0;
    autosave();
  }
}

function recordSample(isPaused) {
  const sample = {
    t: ride.elapsedSec,
    timestamp: new Date().toISOString(),
    power: ride.currentPower,
    heartRate: ride.currentHeartRate,
    cadence: ride.currentCadence,
    speedKmh: ride.currentSpeedKmh,
    distanceMeters: ride.distanceMeters,
    lat: ride.lastLat,
    lon: ride.lastLon,
    altitude: null,
    gpsAccuracy: ride.gpsAccuracy,
    isPaused: !!isPaused
  };
  ride.samples.push(sample);

  if (Number.isFinite(sample.power)) {
    const powers = ride.samples.map(s => s.power).filter(Number.isFinite);
    ride.avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
    ride.maxPower = Math.max(...powers);
  }
}

function pauseRide(auto = false) {
  if (ride.rideState !== 'recording') return;
  ride.rideState = 'paused';
  recordSample(true);
  setPauseButtonLabel();
  autosave();
  ui.showToast(auto ? 'Automatisk pause (ingen bevægelse)' : 'Tur sat på pause');
}

function resumeRide() {
  if (ride.rideState !== 'paused') return;
  ride.rideState = 'recording';
  belowSpeedTicks = 0;
  setPauseButtonLabel();
  autosave();
  ui.showToast('Tur genoptaget');
}

function setPauseButtonLabel() {
  $('pauseBtn').textContent = ride.rideState === 'paused' ? 'RESUME' : 'PAUSE';
}

function addLap() {
  if (ride.rideState !== 'recording' && ride.rideState !== 'paused') return;
  ride.laps.push({
    lapNumber: ride.laps.length + 1,
    elapsedSec: ride.elapsedSec,
    timestamp: new Date().toISOString(),
    distanceMeters: ride.distanceMeters
  });
  autosave();
  ui.showToast(`Lap ${ride.laps.length} registreret`);
}

async function stopRideConfirmed() {
  ride.rideState = 'stopped';
  ride.endTime = new Date().toISOString();
  clearInterval(tickTimer);
  tickTimer = null;
  gps.stop();
  await ui.releaseWakeLock();
  document.body.dataset.rideActive = '0';

  const rideJson = buildRideJson(ride);
  await storage.saveLastRide(rideJson);
  await storage.clearActiveRide();

  $('rideControls').hidden = true;
  $('startBtn').hidden = false;

  showExportSummary(rideJson);
  ui.showModal('exportModal');
}

function showExportSummary(rideJson) {
  const s = rideJson.summary;
  const km = s.distanceKm ?? 0;
  const mins = Math.round((rideJson.durationSec || 0) / 60);
  $('exportSummary').innerHTML = `
    <div><span class="es-label">TID</span><span class="es-value">${mins} min</span></div>
    <div><span class="es-label">DISTANCE</span><span class="es-value">${km.toFixed(1)} km</span></div>
    <div><span class="es-label">AVG POWER</span><span class="es-value">${s.avgPower ?? '--'} W</span></div>
    <div><span class="es-label">AVG PULS</span><span class="es-value">${s.avgHeartRate ?? '--'} bpm</span></div>
  `;
  $('exportDownloadBtn').onclick = () => {
    downloadRideJson(rideJson);
    ui.showToast('JSON eksporteret');
  };
}

async function autosave() {
  await storage.saveActiveRide(ride);
}

// ---------------- Recovery on launch ----------------
async function checkForUnfinishedRide() {
  const saved = await storage.loadActiveRide();
  if (saved && (saved.rideState === 'recording' || saved.rideState === 'paused')) {
    ui.showModal('recoveryModal');
    $('recoveryResumeBtn').onclick = () => resumeSavedRide(saved);
    $('recoveryExportBtn').onclick = () => exportSavedRide(saved);
    $('recoveryDiscardBtn').onclick = () => discardSavedRide();
  }
}

function resumeSavedRide(saved) {
  ride = saved;
  ride.rideState = 'recording';
  document.body.dataset.rideActive = '1';
  $('startBtn').hidden = true;
  $('rideControls').hidden = false;
  setPauseButtonLabel();

  gps.reset();
  gps.restoreTotals({ distanceM: ride.distanceMeters, elevationGainM: ride.elevationGainMeters });
  gps.start();
  ui.requestWakeLock();

  if (rideMap.isReady() && ride.routePoints?.length) rideMap.loadPoints(ride.routePoints);

  tickTimer = setInterval(tick, 1000);
  ui.hideModal('recoveryModal');
  ui.showToast('Tur genoptaget fra gemte data');
}

async function exportSavedRide(saved) {
  const rideForExport = { ...saved, endTime: saved.endTime || new Date().toISOString() };
  const rideJson = buildRideJson(rideForExport);
  downloadRideJson(rideJson);
  await storage.clearActiveRide();
  ui.hideModal('recoveryModal');
  ui.showToast('Ufærdig tur eksporteret');
}

async function discardSavedRide() {
  await storage.clearActiveRide();
  ui.hideModal('recoveryModal');
  ui.showToast('Ufærdig tur slettet');
}

// ---------------- Settings drawer wiring ----------------
function initSettingsDrawer() {
  $('menuBtn').addEventListener('click', () => ui.showModal('settingsDrawer'));
  $('settingsBtn').addEventListener('click', () => ui.showModal('settingsDrawer'));
  $('closeDrawerBtn').addEventListener('click', () => ui.hideModal('settingsDrawer'));

  $('connectPowerBtn').addEventListener('click', async () => {
    try { await sensors.connectPower(); }
    catch { ui.showToast('Kunne ikke forbinde til powermeter'); }
  });
  $('connectHrBtn').addEventListener('click', async () => {
    try { await sensors.connectHeartRate(); }
    catch { ui.showToast('Kunne ikke forbinde til pulsmåler'); }
  });

  $('autoDimToggle').addEventListener('change', (e) => {
    settings.autoDim = e.target.checked;
    ui.setDimEnabled(settings.autoDim);
  });
  $('autoPauseToggle').addEventListener('change', (e) => { settings.autoPause = e.target.checked; });

  $('exportLastBtn').addEventListener('click', async () => {
    const last = await storage.loadLastRide();
    if (!last) { ui.showToast('Ingen gemt tur endnu'); return; }
    downloadRideJson(last);
    ui.showToast('Seneste tur eksporteret');
  });

  $('clearUnfinishedBtn').addEventListener('click', async () => {
    if (!window.confirm('Slet den ufærdige tur permanent?')) return;
    await storage.clearActiveRide();
    ui.showToast('Ufærdig tur ryddet');
  });

  $('aboutBtn').addEventListener('click', () => ui.showModal('aboutModal'));
  $('aboutCloseBtn').addEventListener('click', () => ui.hideModal('aboutModal'));
}

// ---------------- Ride control button wiring ----------------
function initControls() {
  $('startBtn').addEventListener('click', startRide);
  $('lapBtn').addEventListener('click', addLap);
  $('pauseBtn').addEventListener('click', () => {
    if (ride.rideState === 'recording') pauseRide(false);
    else if (ride.rideState === 'paused') resumeRide();
  });
  $('stopBtn').addEventListener('click', () => ui.showModal('stopModal'));
  $('stopConfirmBtn').addEventListener('click', () => { ui.hideModal('stopModal'); stopRideConfirmed(); });
  $('stopCancelBtn').addEventListener('click', () => ui.hideModal('stopModal'));
  $('exportCloseBtn').addEventListener('click', () => ui.hideModal('exportModal'));
  $('recenterBtn').addEventListener('click', () => rideMap.recenter());
}

// ---------------- Boot ----------------
async function boot() {
  ui.initTabs((tab) => { if (tab === 'map') setTimeout(() => rideMap.invalidateSize(), 50); });
  ui.initDimWatchers();
  initSettingsDrawer();
  initControls();

  rideMap.init();
  gps.start(); // pre-ride GPS lock search
  if (!sensors.isBleSupported()) {
    ui.setStatusChip('statusPower', 'error', 'INTET BLE');
    ui.setStatusChip('statusHr', 'error', 'INTET BLE');
  }

  await checkForUnfinishedRide();

  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('sw.js').then((registration) => {
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => { /* offline shell just won't be cached */ });
  }
}

boot();
