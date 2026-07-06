import { GPSTracker, haversineMeters } from './gps.js';
import { PowerMeter, HeartRateMonitor } from './sensors.js';
import { saveActiveRide, getActiveRide, clearActiveRide, saveLastRide, getLastRide, loadSettings, saveSettings } from './storage.js';
import { buildRideJson, downloadRide } from './export.js';
import { RideMap } from './map.js';
import { renderMetrics, setConnection, setRideState, setupTabs, setupSettings, setupDimMode, showInfo } from './ui.js';

const $ = selector => document.querySelector(selector);
const gps = new GPSTracker();
const powerMeter = new PowerMeter();
const hrMonitor = new HeartRateMonitor();
const settings = loadSettings();
const map = new RideMap($('#map'), $('#mapFallback'), $('#mapEmpty'));
let wakeLock = null, ticker = null, autosaveTimer = null, lastGpsSample = null, lowSpeedSince = null, autoPaused = false;

let state = {
  rideState: 'idle', rideId: null, startTime: null, elapsedSec: 0, movingTimeSec: 0,
  distanceMeters: 0, elevationGainMeters: 0, power: null, heartRate: null, cadence: null,
  speedKmh: 0, gpsAccuracy: null, samples: [], laps: [], lastAltitude: null,
  histories: { heartRate: [], cadence: [], speed: [], power: [] }, avgPower: null, maxPower: null
};

function publicRideState() {
  const { histories, ...ride } = state;
  return ride;
}

function newRide() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return {
    rideId: `ride-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}-outdoor`,
    startTime: now.toISOString(), elapsedSec: 0, movingTimeSec: 0, distanceMeters: 0,
    elevationGainMeters: 0, samples: [], laps: [], lastAltitude: null
  };
}

async function startRide(resume = null) {
  if (gps.status !== 'on') {
    const proceed = confirm('GPS har endnu ikke låst positionen. Vil du starte alligevel? Turen kan mangle de første rutepunkter.');
    if (!proceed) return;
  }
  state = { ...state, ...(resume || newRide()), rideState: resume?.rideState === 'paused' ? 'paused' : 'recording', histories: { heartRate: [], cadence: [], speed: [], power: [] } };
  lastGpsSample = [...state.samples].reverse().find(sample => Number.isFinite(sample.lat)) || null;
  setRideState(state.rideState); map.setRoute(state.samples.filter(sample => Number.isFinite(sample.lat)));
  await requestWakeLock();
  startTimers(); await persist(); render();
}

function startTimers() {
  clearInterval(ticker); clearInterval(autosaveTimer);
  ticker = setInterval(sampleTick, 1000);
  autosaveTimer = setInterval(persist, 7000);
}

function sampleTick() {
  if (!['recording','paused'].includes(state.rideState)) return;
  state.elapsedSec += 1;
  const paused = state.rideState === 'paused';
  if (!paused && (state.speedKmh > 1 || Number.isFinite(state.power))) state.movingTimeSec += 1;
  const pos = gps.latest;
  const sample = {
    timestamp: new Date().toISOString(), elapsedSec: state.elapsedSec,
    power: state.power, heartRate: state.heartRate, cadence: state.cadence,
    speedKmh: state.speedKmh, distanceMeters: state.distanceMeters,
    lat: pos?.lat ?? null, lon: pos?.lon ?? null, altitude: pos?.altitude ?? null,
    gpsAccuracy: pos?.accuracy ?? null, heading: pos?.heading ?? null, isPaused: paused
  };
  state.samples.push(sample);
  if (state.samples.length > 180000) state.samples.shift();
  if (!paused) {
    pushHistory('heartRate', state.heartRate); pushHistory('cadence', state.cadence); pushHistory('speed', state.speedKmh); pushHistory('power', state.power);
    const powers = state.samples.filter(s => !s.isPaused && Number.isFinite(s.power)).map(s => s.power);
    state.avgPower = powers.length ? powers.reduce((a,b) => a+b,0) / powers.length : null;
    state.maxPower = powers.length ? Math.max(...powers) : null;
  }
  handleAutoPause(); render();
}

function pushHistory(key, value) { if (Number.isFinite(value)) state.histories[key].push(value); if (state.histories[key].length > 30) state.histories[key].shift(); }

function handleAutoPause() {
  if (!settings.autoPause || state.rideState === 'paused' && !autoPaused) return;
  if (state.rideState === 'recording' && state.speedKmh < 1 && !Number.isFinite(state.power)) {
    lowSpeedSince ||= Date.now();
    if (Date.now() - lowSpeedSince > 10000) { state.rideState = 'paused'; autoPaused = true; setRideState('paused'); persist(); }
  } else {
    lowSpeedSince = null;
    if (autoPaused && state.speedKmh > 2.5) { state.rideState = 'recording'; autoPaused = false; setRideState('recording'); persist(); }
  }
}

async function togglePause() {
  state.rideState = state.rideState === 'paused' ? 'recording' : 'paused'; autoPaused = false;
  setRideState(state.rideState); await persist(); requestWakeLock();
}

async function addLap() {
  state.laps.push({ index: state.laps.length + 1, timestamp: new Date().toISOString(), elapsedSec: state.elapsedSec, distanceMeters: Number(state.distanceMeters.toFixed(1)) });
  await persist(); showInfo('Lap gemt', `Lap ${state.laps.length} ved ${(state.distanceMeters / 1000).toFixed(1)} km.`);
}

async function stopRide() {
  const result = buildRideJson(publicRideState());
  clearInterval(ticker); clearInterval(autosaveTimer); state.rideState = 'stopped';
  await saveLastRide(result); await clearActiveRide(); releaseWakeLock(); setRideState('stopped');
  $('#resultSummary').textContent = `${(result.distanceMeters / 1000).toFixed(1)} km · ${result.summary.avgPower ?? '--'} W i snit · klar til Training.`;
  $('#resultDialog').showModal();
}

async function persist() { if (['recording','paused'].includes(state.rideState)) await saveActiveRide(publicRideState()); }

function render() { renderMetrics(state); }

gps.addEventListener('position', event => {
  const point = event.detail; state.speedKmh = point.speedKmh ?? state.speedKmh; state.gpsAccuracy = point.accuracy;
  if (state.rideState === 'recording' && (!lastGpsSample || point.accuracy <= 50)) {
    if (lastGpsSample) {
      const distance = haversineMeters(lastGpsSample, point);
      if (distance >= 2 && distance < 200) { state.distanceMeters += distance; lastGpsSample = point; map.addPoint(point); }
    } else { lastGpsSample = point; map.addPoint(point); }
    if (Number.isFinite(point.altitude) && Number.isFinite(state.lastAltitude)) {
      const gain = point.altitude - state.lastAltitude;
      if (gain >= 2 && gain < 30) { state.elevationGainMeters += gain; state.lastAltitude = point.altitude; }
      else if (Math.abs(gain) >= 2) state.lastAltitude = point.altitude;
    } else if (Number.isFinite(point.altitude)) state.lastAltitude = point.altitude;
  } else if (state.rideState === 'paused') {
    lastGpsSample = point;
    if (Number.isFinite(point.altitude)) state.lastAltitude = point.altitude;
  }
  render();
});
gps.addEventListener('status', event => setConnection('gps', event.detail.status, event.detail.accuracy ? `Låst · ±${Math.round(event.detail.accuracy)} m` : event.detail.message));

powerMeter.addEventListener('data', event => { state.power = event.detail.power; state.cadence = event.detail.cadence; render(); });
hrMonitor.addEventListener('data', event => { state.heartRate = event.detail.heartRate; render(); });
[powerMeter, hrMonitor].forEach(sensor => sensor.addEventListener('status', event => setConnection(event.detail.type, event.detail.status, event.detail.deviceName || event.detail.message)));

async function connectSensor(sensor) {
  try { await sensor.connect(); }
  catch (error) { setConnection(sensor.type, 'error', error.message); showInfo('Kunne ikke forbinde', error.message); }
}

async function requestWakeLock() {
  $('#wakeWarning').hidden = true;
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') { $('#wakeWarning').hidden = false; return; }
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
  catch { $('#wakeWarning').hidden = false; }
}
function releaseWakeLock() { wakeLock?.release(); wakeLock = null; }

setupTabs(tab => { if (tab === 'map') map.show(); }); setupSettings(); setupDimMode(() => settings.autoDim);
$('#startButton').addEventListener('click', () => startRide());
$('#pauseButton').addEventListener('click', togglePause); $('#lapButton').addEventListener('click', addLap);
$('#stopButton').addEventListener('click', () => $('#confirmDialog').showModal());
$('#confirmDialog').addEventListener('close', () => { if ($('#confirmDialog').returnValue === 'confirm') stopRide(); });
$('#connectPower').addEventListener('click', () => connectSensor(powerMeter)); $('#powerStatus').addEventListener('click', () => connectSensor(powerMeter));
$('#connectHr').addEventListener('click', () => connectSensor(hrMonitor)); $('#hrStatus').addEventListener('click', () => connectSensor(hrMonitor));
$('#recenterButton').addEventListener('click', () => map.recenter());
$('#followRouteButton')?.addEventListener('click', () => map.recenter());
$('#zoomInButton')?.addEventListener('click', () => map.zoomIn());
$('#zoomOutButton')?.addEventListener('click', () => map.zoomOut());
$('#layersButton')?.addEventListener('click', () => map.cycleLayer());
$('#autoDim').checked = settings.autoDim; $('#autoPause').checked = settings.autoPause;
$('#autoDim').addEventListener('change', event => { settings.autoDim = event.target.checked; saveSettings(settings); });
$('#autoPause').addEventListener('change', event => { settings.autoPause = event.target.checked; saveSettings(settings); });
$('#exportLast').addEventListener('click', async () => { const ride = await getLastRide(); ride ? downloadRide(ride) : showInfo('Ingen gemt tur', 'Afslut en tur først – så kan den eksporteres herfra.'); });
$('#clearUnfinished').addEventListener('click', async () => { if (confirm('Vil du permanent slette den ufærdige tur?')) { await clearActiveRide(); showInfo('Ufærdig tur ryddet', 'Den aktive autosave er slettet. Afsluttede ture er ikke berørt.'); } });
$('#showAbout').addEventListener('click', () => showInfo('Om Bike Outdoor', 'Web Bluetooth kræver en understøttet Android-browser. GPS kræver tilladelse. Hold appen åben under turen; baggrunds- og låseskærmstracking er ikke pålidelig i en PWA. Kortfliser kræver internet, men GPS-sporet gemmes også uden kort. Ingen Home Assistant, login, cloud eller backend.'));
$('#exportRide').addEventListener('click', async () => { const ride = await getLastRide(); if (ride) downloadRide(ride); });
$('#recoveryDialog').addEventListener('close', async () => {
  const action = $('#recoveryDialog').returnValue, ride = await getActiveRide();
  if (action === 'resume' && ride) startRide(ride);
  if (action === 'export' && ride) downloadRide(buildRideJson(ride));
  if (action === 'discard') await clearActiveRide();
});
document.addEventListener('visibilitychange', () => { persist(); if (document.visibilityState === 'visible' && ['recording','paused'].includes(state.rideState)) requestWakeLock(); });
window.addEventListener('beforeunload', persist); window.addEventListener('resize', () => map.show());

if ('getBattery' in navigator) navigator.getBattery().then(battery => { const node = $('#batteryStatus'); node.hidden = false; node.dataset.state = 'on'; const update = () => node.querySelector('small').textContent = `${Math.round(battery.level * 100)}%`; update(); battery.addEventListener('levelchange', update); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));

setRideState('idle'); render(); gps.start();
getActiveRide().then(ride => { if (ride?.rideId && ['recording','paused'].includes(ride.rideState)) $('#recoveryDialog').showModal(); });
