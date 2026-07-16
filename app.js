'use strict';

const APP_VERSION = '3.7.2';
const APP_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let toastTimer = null;
let workoutMessageTimers = [];

function log(message) {
  const target = document.querySelector('#debugLog');
  if (!target) return;
  const stamp = new Date().toLocaleTimeString('da-DK', { hour12: false });
  target.textContent = `[${stamp}] ${message}\n${target.textContent}`.slice(0, 7000);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3400);
}

// Standard Bluetooth SIG UUIDs. FTMS Control Point bruges til ERG/target watt.
const UUID = {
  cyclingPowerService: 0x1818,
  cyclingPowerMeasurement: 0x2a63,
  cscService: 0x1816,
  cscMeasurement: 0x2a5b,
  fitnessMachineService: 0x1826,
  indoorBikeData: 0x2ad2,
  fitnessMachineControlPoint: 0x2ad9,
  heartRateService: 0x180d,
  heartRateMeasurement: 0x2a37,
};

const els = {
  connectButton: document.querySelector('#connectButton'),
  resetButton: document.querySelector('#resetButton'),
  demoButton: document.querySelector('#demoButton'),
  installButton: document.querySelector('#installButton'),
  appVersionText: document.querySelector('#appVersionText'),
  appUpdateStatus: document.querySelector('#appUpdateStatus'),
  appUpdateButton: document.querySelector('#appUpdateButton'),
  settingsButton: document.querySelector('#settingsButton'),
  closeSettingsButton: document.querySelector('#closeSettingsButton'),
  settingsPanel: document.querySelector('#settingsPanel'),
  settingsBackdrop: document.querySelector('#settingsBackdrop'),
  fullscreenButton: document.querySelector('#fullscreenButton'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  deviceText: document.querySelector('#deviceText'),
  powerValue: document.querySelector('#powerValue'),
  cadenceValue: document.querySelector('#cadenceValue'),
  averagePower: document.querySelector('#averagePower'),
  maxPower: document.querySelector('#maxPower'),
  distanceValue: document.querySelector('#distanceValue'),
  elapsedTime: document.querySelector('#elapsedTime'),
  dataSource: document.querySelector('#dataSource'),
  heartRateConnectButton: document.querySelector('#heartRateConnectButton'),
  heartRateValue: document.querySelector('#heartRateValue'),
  heartRateState: document.querySelector('#heartRateState'),
  heartStatusDot: document.querySelector('#heartStatusDot'),
  heartRateConnectionText: document.querySelector('#heartRateConnectionText'),
  cadenceRing: document.querySelector('#cadenceRing'),
  cadenceIcon: document.querySelector('#cadenceIcon'),
  heartRateRing: document.querySelector('#heartRateRing'),
  heartPulseIcon: document.querySelector('#heartPulseIcon'),
  workoutWattScale: document.querySelector('#workoutWattScale'),
  heartChartAverage: document.querySelector('#heartChartAverage'),
  heartChartLine: document.querySelector('#heartChartLine'),
  heartChartArea: document.querySelector('#heartChartArea'),
  heartChartEmpty: document.querySelector('#heartChartEmpty'),
  powerZone: document.querySelector('#powerZone'),
  stopRideButton: document.querySelector('#stopRideButton'),
  chooseRideFolderButton: document.querySelector('#chooseRideFolderButton'),
  rideFolderStatus: document.querySelector('#rideFolderStatus'),
  rideSaveStatus: document.querySelector('#rideSaveStatus'),
  activeWorkoutLabel: document.querySelector('#activeWorkoutLabel'),
  ftpInput: document.querySelector('#ftpInput'),
  workoutImportButton: document.querySelector('#workoutImportButton'),
  workoutFileInput: document.querySelector('#workoutFileInput'),
  workoutImportStatus: document.querySelector('#workoutImportStatus'),
  workoutImportSummary: document.querySelector('#workoutImportSummary'),
  workoutPanelTitle: document.querySelector('#workoutPanelTitle'),
  workoutStatePill: document.querySelector('#workoutStatePill'),
  ergStatusText: document.querySelector('#ergStatusText'),
  workoutTargetLabel: document.querySelector('#workoutTargetLabel'),
  workoutTargetPower: document.querySelector('#workoutTargetPower'),
  workoutTargetNote: document.querySelector('#workoutTargetNote'),
  workoutBlockTime: document.querySelector('#workoutBlockTime'),
  workoutBlockLabel: document.querySelector('#workoutBlockLabel'),
  workoutElapsed: document.querySelector('#workoutElapsed'),
  workoutRemaining: document.querySelector('#workoutRemaining'),
  workoutProgressFill: document.querySelector('#workoutProgressFill'),
  workoutGraphBlocks: document.querySelector('#workoutGraphBlocks'),
  workoutGraphCursor: document.querySelector('#workoutGraphCursor'),
  workoutGraphCursorDot: document.querySelector('#workoutGraphCursorDot'),
  currentIntervalIcon: document.querySelector('#currentIntervalIcon'),
  nextIntervalIcon: document.querySelector('#nextIntervalIcon'),
  currentIntervalWatts: document.querySelector('#currentIntervalWatts'),
  currentIntervalRange: document.querySelector('#currentIntervalRange'),
  nextIntervalWatts: document.querySelector('#nextIntervalWatts'),
  nextIntervalRange: document.querySelector('#nextIntervalRange'),
  workoutGraphNow: document.querySelector('#workoutGraphNow'),
  workoutNextBlock: document.querySelector('#workoutNextBlock'),
  workoutStartPauseButton: document.querySelector('#workoutStartPauseButton'),
  ergModeButton: document.querySelector('#ergModeButton'),
  workoutResetButton: document.querySelector('#workoutResetButton'),
  workoutMessageOverlay: document.querySelector('#workoutMessageOverlay'),
  workoutMessageTitle: document.querySelector('#workoutMessageTitle'),
  workoutMessageText: document.querySelector('#workoutMessageText'),
};

let bluetoothDevice = null;
let subscribedCharacteristics = [];
let reconnectCancelled = false;
let wakeLock = null;
let demoTimer = null;
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;
let waitingServiceWorker = null;
let reloadForServiceWorkerUpdate = false;
let appUpdateCheckTimer = null;
let lastCadencePacketAt = 0;
let heartRateDevice = null;
let heartRateCharacteristic = null;
let heartRateReconnectCancelled = false;
let lastHeartRatePacketAt = 0;
let lastHeartChartRenderAt = 0;
let ftmsPowerEnabled = false;
let ftmsControlCharacteristic = null;
let currentRide = null;
let rideLoggingTimer = null;
let rideDirectoryHandle = null;
let rideStartArmed = true;

const RIDE_FILE_VERSION = 1;
const RIDE_DB_NAME = 'kickr-live-storage';
const RIDE_DB_STORE = 'handles';
const RIDE_DIRECTORY_KEY = 'ride-directory';
const BLUETOOTH_DEVICE_CACHE_KEY = 'kickr-live-bluetooth-devices-v1';
const WORKOUT_FTP_KEY = 'kickr-live-workout-ftp-v1';
const ERG_MIN_WATTS = 30;
const ERG_MAX_WATTS = 500;
const ERG_COMMAND_MIN_INTERVAL_MS = 900;
const SVG_NS = 'http://www.w3.org/2000/svg';
const WORKOUT_GRAPH_WIDTH = 600;
const WORKOUT_GRAPH_TOP = 8;
const WORKOUT_GRAPH_BASE = 110;
const WORKOUT_GRAPH_MIN_HEIGHT = 7;
const FTMS_CONTROL = Object.freeze({
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_TARGET_POWER: 0x05,
  START_OR_RESUME: 0x07,
  RESPONSE_CODE: 0x80,
});

const crankState = {
  power: { revolutions: null, eventTime: null },
  csc: { revolutions: null, eventTime: null },
};

const session = {
  startedAt: null,
  powerSamples: [],
  power3sSamples: [],
  powerSum: 0,
  powerCount: 0,
  maxPower: 0,
  currentPower: null,
  currentCadence: null,
  currentHeartRate: null,
  heartRateSamples: [],
  heartChartMin: null,
  heartChartMax: null,
  distanceMeters: 0,
  distanceMode: null,
  currentSpeedKph: null,
  previousSpeedKph: null,
  lastSpeedAt: null,
  ftmsLastRawMeters: null,
  ftmsLastAt: null,
};


const workoutState = {
  workout: null,
  ftp: readStoredFtp(),
  startedAt: null,
  pausedAt: null,
  pausedMs: 0,
  running: false,
  shownMessages: new Set(),
  lastMessageElapsed: 0,
};

const ergState = {
  available: false,
  enabled: false,
  controlGranted: false,
  activeTarget: null,
  lastCommandKey: null,
  lastCommandAt: 0,
  queue: Promise.resolve(),
  lastError: null,
};

let workoutGraphRenderKey = '';
let workoutMessageTimer = null;

function setRing(element, value, maximum) {
  if (!element) return;
  const degrees = Math.max(0, Math.min(360, (Number(value) || 0) / maximum * 360));
  element.parentElement?.style.setProperty('--value', `${degrees}deg`);
}

function updateHeartRateChart(force = false, connected = true) {
  const now = Date.now();
  if (!force && now - lastHeartChartRenderAt < 900) return;
  lastHeartChartRenderAt = now;
  session.heartRateSamples = session.heartRateSamples.filter(sample => now - sample.time <= 600000);

  if (!connected || !session.heartRateSamples.length) {
    els.heartChartLine?.setAttribute('d', '');
    els.heartChartArea?.setAttribute('d', '');
    if (els.heartChartAverage) els.heartChartAverage.textContent = '--';
    if (els.heartChartEmpty) els.heartChartEmpty.hidden = false;
    return;
  }

  const samples = session.heartRateSamples;
  const values = samples.map(sample => sample.heartRate);
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const center = (rawMin + rawMax) / 2;
  const halfSpan = Math.max(10, (rawMax - rawMin) / 2 + 5);
  const targetMin = Math.max(30, Math.floor((center - halfSpan) / 5) * 5);
  const targetMax = Math.min(240, Math.ceil((center + halfSpan) / 5) * 5);

  session.heartChartMin = session.heartChartMin === null
    ? targetMin
    : targetMin < session.heartChartMin
      ? targetMin
      : session.heartChartMin + ((targetMin - session.heartChartMin) * 0.08);
  session.heartChartMax = session.heartChartMax === null
    ? targetMax
    : targetMax > session.heartChartMax
      ? targetMax
      : session.heartChartMax + ((targetMax - session.heartChartMax) * 0.08);

  const width = 300;
  const height = 88;
  const firstTime = Math.max(now - 600000, samples[0].time);
  const span = Math.max(1, now - firstTime);
  const ySpan = Math.max(20, session.heartChartMax - session.heartChartMin);
  const points = samples.map(sample => {
    const x = ((sample.time - firstTime) / span) * width;
    const ratio = (sample.heartRate - session.heartChartMin) / ySpan;
    const y = height - 6 - (Math.max(0, Math.min(1, ratio)) * (height - 12));
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  els.heartChartLine?.setAttribute('d', line);
  els.heartChartArea?.setAttribute('d', area);
  if (els.heartChartAverage) els.heartChartAverage.textContent = String(average);
  if (els.heartChartEmpty) els.heartChartEmpty.hidden = true;
}

function renderDistance() {
  if (!els.distanceValue) return;
  const kilometres = Math.max(0, session.distanceMeters) / 1000;
  els.distanceValue.textContent = `${kilometres.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} km`;
}

function updateSpeedDistance(speedKph, now = Date.now()) {
  if (!Number.isFinite(speedKph) || speedKph < 0 || speedKph > 200) return;
  ensureSessionStarted(session.currentPower, session.currentCadence, speedKph);

  if (session.distanceMode !== 'ftms' && session.lastSpeedAt !== null) {
    const elapsedMs = now - session.lastSpeedAt;
    if (elapsedMs > 0 && elapsedMs <= 10000) {
      const previous = Number.isFinite(session.previousSpeedKph) ? session.previousSpeedKph : speedKph;
      const averageMetresPerSecond = ((previous + speedKph) / 2) / 3.6;
      session.distanceMeters += Math.max(0, averageMetresPerSecond * (elapsedMs / 1000));
    }
  }

  if (session.distanceMode === null) session.distanceMode = 'speed';
  session.previousSpeedKph = speedKph;
  session.currentSpeedKph = speedKph;
  session.lastSpeedAt = now;
  renderDistance();
}

function updateFtmsDistance(rawMeters, now = Date.now(), speedKph = null) {
  if (!Number.isFinite(rawMeters) || rawMeters < 0) return;
  ensureSessionStarted(session.currentPower, session.currentCadence, speedKph);

  if (session.ftmsLastRawMeters !== null && session.ftmsLastAt !== null) {
    const elapsedMs = now - session.ftmsLastAt;
    const delta = rawMeters - session.ftmsLastRawMeters;
    const referenceSpeed = Number.isFinite(speedKph) ? speedKph : session.currentSpeedKph;
    const expectedMetres = Number.isFinite(referenceSpeed) && elapsedMs > 0
      ? (referenceSpeed / 3.6) * (elapsedMs / 1000)
      : 0;
    const maximumPlausibleDelta = Math.max(30, (expectedMetres * 3) + 20);

    if (elapsedMs > 0 && elapsedMs <= 15000 && delta >= 0 && delta <= maximumPlausibleDelta) {
      session.distanceMeters += delta;
    }
  }

  session.distanceMode = 'ftms';
  session.ftmsLastRawMeters = rawMeters;
  session.ftmsLastAt = now;
  if (Number.isFinite(speedKph)) {
    session.previousSpeedKph = speedKph;
    session.currentSpeedKph = speedKph;
  }
  session.lastSpeedAt = now;
  renderDistance();
}

function resetPowerSmoothing() {
  session.power3sSamples = [];
  session.currentPower = null;
  els.powerValue.textContent = '--';
}

function prepareForTrainerReconnect() {
  resetPowerSmoothing();
  session.currentCadence = null;
  session.currentSpeedKph = null;
  session.previousSpeedKph = null;
  session.lastSpeedAt = null;
  session.ftmsLastRawMeters = null;
  session.ftmsLastAt = null;
  els.cadenceValue.textContent = '--';
  setRing(els.cadenceRing, 0, 120);
  setCadenceIconSpeed(0);
  els.powerZone.textContent = 'Venter på data';
}

function setStatus(state, title, subtitle) {
  els.statusDot.className = `status-dot ${state}`;
  els.statusText.textContent = title;
  els.deviceText.textContent = subtitle;
  const connected = state === 'connected';
  els.connectButton.hidden = false;
  els.connectButton.disabled = state === 'connecting';
  els.connectButton.classList.toggle('is-connected', connected);
  els.connectButton.setAttribute('aria-label', connected ? 'Afbryd KICKR' : 'Forbind KICKR');
  els.connectButton.title = connected ? 'Tryk for at afbryde KICKR' : 'Tryk for at forbinde KICKR';
}

function setHeartRateStatus(state, title, subtitle) {
  els.heartStatusDot.className = `status-dot ${state}`;
  els.heartRateState.textContent = title;
  els.heartRateConnectionText.textContent = subtitle;
  const connected = state === 'connected';
  els.heartRateConnectButton.disabled = state === 'connecting';
  els.heartRateConnectButton.classList.toggle('is-connected', connected);
  els.heartRateConnectButton.setAttribute('aria-label', connected ? 'Afbryd pulsmåler' : 'Forbind pulsmåler');
  els.heartRateConnectButton.title = connected ? 'Tryk for at afbryde pulsmåleren' : 'Tryk for at forbinde pulsmåleren';
}

function readBluetoothDeviceCache() {
  try {
    const raw = localStorage.getItem(BLUETOOTH_DEVICE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    log(`Kunne ikke læse gemt Bluetooth-udstyr: ${error.message}`);
    return {};
  }
}

function writeBluetoothDeviceCache(cache) {
  try {
    localStorage.setItem(BLUETOOTH_DEVICE_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    log(`Kunne ikke gemme Bluetooth-udstyr: ${error.message}`);
  }
}

function rememberBluetoothDevice(type, device) {
  if (!device?.id) return;
  const cache = readBluetoothDeviceCache();
  cache[type] = {
    id: device.id,
    name: device.name || '',
    lastConnected: new Date().toISOString(),
  };
  writeBluetoothDeviceCache(cache);
}

function normalizeDeviceName(device) {
  return String(device?.name || '').trim().toLowerCase();
}

function deviceMatchesSavedDevice(device, saved) {
  if (!device || !saved) return false;
  return Boolean((saved.id && device.id === saved.id) || (saved.name && device.name === saved.name));
}

function isLikelyKickrDevice(device) {
  const name = normalizeDeviceName(device);
  if (!name) return false;
  if (name.includes('kickr')) return true;
  return name.includes('wahoo') && !name.includes('tickr');
}

function isLikelyHeartRateDevice(device) {
  const name = normalizeDeviceName(device);
  if (!name || name.includes('kickr')) return false;
  return /(^|[^a-z])(hr|bpm)([^a-z]|$)|heart|pulse|puls|pulsm|tickr|polar|coospo|igpsport|hr70/.test(name);
}

function findRememberedDevice(devices, type) {
  const cache = readBluetoothDeviceCache();
  const saved = cache[type];
  const savedMatch = devices.find(device => deviceMatchesSavedDevice(device, saved));
  if (savedMatch) return savedMatch;

  if (type === 'kickr') return devices.find(isLikelyKickrDevice) || null;
  if (type === 'heart_rate') return devices.find(isLikelyHeartRateDevice) || null;
  return null;
}

function addBluetoothDisconnectListener(device, handler) {
  if (!device || typeof device.addEventListener !== 'function') return;
  device.removeEventListener('gattserverdisconnected', handler);
  device.addEventListener('gattserverdisconnected', handler);
}

function hasActiveBluetoothDevice(device) {
  return Boolean(device?.gatt?.connected);
}

function ensureSessionStarted(power, cadence, speed = null) {
  const moving = (power ?? 0) > 0 || (cadence ?? 0) > 0 || (speed ?? 0) > 0;
  if (!moving) {
    if (!session.startedAt && !currentRide) rideStartArmed = true;
    return;
  }
  if (!session.startedAt && rideStartArmed) {
    rideStartArmed = false;
    session.startedAt = Date.now();
    startRideRecording(session.startedAt);
    log('Turdata startede ved første registrerede bevægelse.');
  }
}

function createRideId(startedAt) {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ride-${startedAt}-${Math.random().toString(16).slice(2)}`;
}

function readStoredFtp() {
  const stored = Number(localStorage.getItem(WORKOUT_FTP_KEY));
  return Number.isFinite(stored) && stored >= 50 && stored <= 500 ? Math.round(stored) : 165;
}

function setWorkoutFtp(value) {
  const ftp = Math.max(50, Math.min(500, Math.round(Number(value) || 165)));
  workoutState.ftp = ftp;
  localStorage.setItem(WORKOUT_FTP_KEY, String(ftp));
  if (els.ftpInput) els.ftpInput.value = String(ftp);
  updateWorkoutUi(true);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function ftmsControlRequestName(opcode) {
  switch (opcode) {
    case FTMS_CONTROL.REQUEST_CONTROL: return 'Request Control';
    case FTMS_CONTROL.RESET: return 'Reset';
    case FTMS_CONTROL.SET_TARGET_POWER: return 'Set Target Power';
    case FTMS_CONTROL.START_OR_RESUME: return 'Start/Resume';
    default: return `Opcode 0x${opcode.toString(16).padStart(2, '0')}`;
  }
}

function ftmsControlResultName(code) {
  switch (code) {
    case 0x01: return 'Success';
    case 0x02: return 'Opcode ikke understøttet';
    case 0x03: return 'Ugyldig parameter';
    case 0x04: return 'Fejlede';
    case 0x05: return 'Control ikke tilladt';
    default: return `Ukendt svar ${code}`;
  }
}

function resetErgConnection() {
  ftmsControlCharacteristic = null;
  ergState.available = false;
  ergState.controlGranted = false;
  ergState.activeTarget = null;
  ergState.lastCommandKey = null;
  ergState.lastError = null;
  updateErgUi();
}

function setErgAvailable(available, reason = '') {
  ergState.available = Boolean(available);
  if (!ergState.available) {
    ergState.controlGranted = false;
    ergState.activeTarget = null;
    ergState.lastCommandKey = null;
  }
  if (reason) log(reason);
  updateErgUi();
}

function updateErgUi() {
  if (els.ergModeButton) {
    els.ergModeButton.disabled = !ergState.available;
    els.ergModeButton.textContent = ergState.enabled ? 'ERG til' : 'ERG fra';
    els.ergModeButton.classList.toggle('active', ergState.enabled);
  }
  if (!els.ergStatusText) return;
  if (!ergState.available) {
    els.ergStatusText.textContent = 'ERG ikke forbundet';
    els.ergStatusText.className = 'erg-status-text unavailable';
    return;
  }
  if (!ergState.enabled) {
    els.ergStatusText.textContent = 'ERG klar · slukket';
    els.ergStatusText.className = 'erg-status-text';
    return;
  }
  if (ergState.lastError) {
    els.ergStatusText.textContent = `ERG fejl · ${ergState.lastError}`;
    els.ergStatusText.className = 'erg-status-text error';
    return;
  }
  if (Number.isFinite(ergState.activeTarget)) {
    els.ergStatusText.textContent = `ERG aktiv · ${Math.round(ergState.activeTarget)} W`;
    els.ergStatusText.className = 'erg-status-text active';
    return;
  }
  els.ergStatusText.textContent = workoutState.running ? 'ERG fri / standby' : 'ERG klar';
  els.ergStatusText.className = 'erg-status-text active';
}

function handleFtmsControlPoint(event) {
  const view = event.target.value;
  if (!view || view.byteLength < 3) return;
  const opcode = view.getUint8(0);
  if (opcode !== FTMS_CONTROL.RESPONSE_CODE) return;
  const requestOpcode = view.getUint8(1);
  const resultCode = view.getUint8(2);
  const ok = resultCode === 0x01;
  const requestName = ftmsControlRequestName(requestOpcode);
  const resultName = ftmsControlResultName(resultCode);

  if (requestOpcode === FTMS_CONTROL.REQUEST_CONTROL) ergState.controlGranted = ok;
  if (!ok) {
    ergState.lastError = resultName;
    log(`ERG ${requestName}: ${resultName}`);
  } else {
    ergState.lastError = null;
    log(`ERG ${requestName}: Success`);
  }
  updateErgUi();
}

function ftmsPayload(opcode, value = null) {
  if (opcode === FTMS_CONTROL.SET_TARGET_POWER) {
    const watts = Math.max(ERG_MIN_WATTS, Math.min(ERG_MAX_WATTS, Math.round(Number(value) || 0)));
    const bytes = new Uint8Array(3);
    bytes[0] = opcode;
    new DataView(bytes.buffer).setInt16(1, watts, true);
    return bytes;
  }
  return new Uint8Array([opcode]);
}

async function writeFtmsControl(payload, label) {
  if (!ftmsControlCharacteristic) throw new Error('FTMS Control Point er ikke klar. Forbind KICKR igen.');
  if (typeof ftmsControlCharacteristic.writeValueWithResponse === 'function') {
    await ftmsControlCharacteristic.writeValueWithResponse(payload);
  } else {
    await ftmsControlCharacteristic.writeValue(payload);
  }
  log(`ERG kommando sendt: ${label}`);
}

function enqueueErgCommand(label, payload, { allowWhenDisabled = false } = {}) {
  ergState.queue = ergState.queue.catch(() => {}).then(async () => {
    if (!allowWhenDisabled && !ergState.enabled) return;
    if (!ftmsControlCharacteristic) return;
    await writeFtmsControl(payload, label);
  });
  ergState.queue.catch(error => {
    ergState.lastError = error.message;
    log(`ERG-fejl: ${error.message}`);
    showToast(`ERG-fejl: ${error.message}`);
    updateErgUi();
  });
  return ergState.queue;
}

async function requestErgControlIfNeeded() {
  if (!ergState.enabled || !ftmsControlCharacteristic) return;
  if (ergState.controlGranted) return;
  await enqueueErgCommand('Request Control', ftmsPayload(FTMS_CONTROL.REQUEST_CONTROL));
  // KICKR svarer via Control Point notification. Vi fortsætter optimistisk, så UI ikke hænger.
  ergState.controlGranted = true;
  await sleep(120);
  updateErgUi();
}

async function sendErgTargetPower(targetPower, { force = false } = {}) {
  if (!ergState.enabled || !ftmsControlCharacteristic || !Number.isFinite(targetPower)) return;
  const cleanTarget = Math.max(ERG_MIN_WATTS, Math.min(ERG_MAX_WATTS, Math.round(targetPower)));
  const now = Date.now();
  const commandKey = `target-${cleanTarget}`;
  if (!force && ergState.lastCommandKey === commandKey && now - ergState.lastCommandAt < ERG_COMMAND_MIN_INTERVAL_MS) return;
  if (!force && Number.isFinite(ergState.activeTarget) && Math.abs(ergState.activeTarget - cleanTarget) < 1 && now - ergState.lastCommandAt < 4000) return;

  await requestErgControlIfNeeded();
  await enqueueErgCommand(`Set Target Power ${cleanTarget} W`, ftmsPayload(FTMS_CONTROL.SET_TARGET_POWER, cleanTarget));
  ergState.activeTarget = cleanTarget;
  ergState.lastCommandKey = commandKey;
  ergState.lastCommandAt = now;
  ergState.lastError = null;
  updateErgUi();
}

async function releaseErgControl(reason = 'frigivet') {
  if (!ftmsControlCharacteristic) return;
  if (!ergState.enabled && ergState.activeTarget === null && !ergState.controlGranted) return;
  ergState.activeTarget = null;
  ergState.lastCommandKey = `release-${reason}`;
  ergState.controlGranted = false;
  await enqueueErgCommand(`Reset / ${reason}`, ftmsPayload(FTMS_CONTROL.RESET), { allowWhenDisabled: true });
  updateErgUi();
}

async function toggleErgMode() {
  if (!ergState.available || !ftmsControlCharacteristic) {
    showToast('ERG er ikke tilgængelig på denne KICKR-forbindelse');
    updateErgUi();
    return;
  }
  if (ergState.enabled) {
    ergState.enabled = false;
    await releaseErgControl('ERG slukket');
    showToast('ERG slået fra');
    updateErgUi();
    return;
  }
  ergState.enabled = true;
  ergState.lastError = null;
  showToast('ERG slået til');
  updateErgUi();
  if (workoutState.running) await syncErgToWorkout(true);
}

async function syncErgToWorkout(force = false) {
  if (!ergState.enabled || !ergState.available || !workoutState.workout || !workoutState.running) return;
  const elapsed = currentWorkoutElapsedSeconds();
  if (elapsed >= workoutState.workout.totalSeconds) {
    await releaseErgControl('workout færdig');
    return;
  }
  const { block, index } = currentWorkoutBlock();
  if (!block) return;
  const target = targetPowerForBlock(block, Math.max(0, elapsed - block.start));
  if (target === null) {
    const commandKey = `free-${index}`;
    if (force || ergState.lastCommandKey !== commandKey) {
      await releaseErgControl('FreeRide');
      ergState.lastCommandKey = commandKey;
      updateErgUi();
    }
    return;
  }
  await sendErgTargetPower(target, { force });
}

async function setupFtmsControl(ftmsService) {
  ftmsControlCharacteristic = null;
  ergState.controlGranted = false;
  ergState.activeTarget = null;
  ergState.lastCommandKey = null;
  try {
    const characteristic = await ftmsService.getCharacteristic(UUID.fitnessMachineControlPoint);
    ftmsControlCharacteristic = characteristic;
    try {
      characteristic.addEventListener('characteristicvaluechanged', handleFtmsControlPoint);
      await characteristic.startNotifications();
      subscribedCharacteristics.push({ characteristic, handler: handleFtmsControlPoint });
      log('FTMS Control Point klar med svar/indications.');
    } catch (notificationError) {
      log(`FTMS Control Point kan skrives til, men svar kunne ikke abonneres: ${notificationError.message}`);
    }
    setErgAvailable(true, 'ERG/FTMS Control Point fundet.');
  } catch (error) {
    ftmsControlCharacteristic = null;
    setErgAvailable(false, `FTMS Control Point ikke tilgængelig: ${error.message}`);
  }
}

function parsePercent(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const number = Number(match[0]);
  if (!Number.isFinite(number)) return null;

  // Nogle eksportører skriver fx "115%" eller "190 W" i stedet for ZWO-standardens 1.15.
  // Internt gemmer vi stadig alt som FTP-multiplier, så graf, target og ERG bruger samme model.
  if (/w(?:att)?s?\b/i.test(normalized) && Number.isFinite(workoutState?.ftp) && workoutState.ftp > 0) {
    return number / workoutState.ftp;
  }
  if (normalized.includes('%') || number > 2) return number / 100;
  return number;
}

function parseDuration(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const plain = Number(raw);
  if (Number.isFinite(plain) && plain > 0) return plain;

  const clockMatch = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.\d+)?$/);
  if (clockMatch) {
    const hours = Number(clockMatch[1] || 0);
    const minutes = Number(clockMatch[2] || 0);
    const seconds = Number(clockMatch[3] || 0);
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? total : 0;
  }

  const isoMatch = raw.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (isoMatch) {
    const total = (Number(isoMatch[1] || 0) * 3600) + (Number(isoMatch[2] || 0) * 60) + Number(isoMatch[3] || 0);
    return total > 0 ? total : 0;
  }

  return 0;
}

function blockPowerLabel(block) {
  if (!block) return '—';
  if (block.freeRide) return 'FreeRide';
  if (Number.isFinite(block.powerLow) && Number.isFinite(block.powerHigh)) return `${Math.round(block.powerLow * 100)}–${Math.round(block.powerHigh * 100)}%`;
  if (Number.isFinite(block.power)) return `${Math.round(block.power * 100)}%`;
  return '—';
}

function blockNameFromTag(tagName) {
  const tag = String(tagName || '').toLowerCase();
  if (tag === 'warmup') return 'Opvarmning';
  if (tag === 'cooldown') return 'Nedkørsel';
  if (tag === 'freeride') return 'FreeRide';
  if (tag === 'steadystate') return 'Fast watt';
  if (tag === 'ramp') return 'Ramp';
  return tagName || 'Blok';
}

function makeWorkoutBlock({ name, duration, power = null, powerLow = null, powerHigh = null, freeRide = false }) {
  return { name, duration, power, powerLow, powerHigh, freeRide };
}

function normalizeWorkoutAttrName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readAttr(element, names) {
  if (!element?.attributes) return null;
  const wanted = new Set(names.map(normalizeWorkoutAttrName));
  for (const attr of [...element.attributes]) {
    if (wanted.has(normalizeWorkoutAttrName(attr.name)) && attr.value !== '') return attr.value;
  }
  return null;
}

function isWorkoutTextNode(node) {
  const normalized = String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['textevent', 'text', 'caption', 'comment', 'message', 'workouttext'].includes(normalized);
}

function workoutTextFromNode(node) {
  if (!node) return '';
  const attrText = readAttr(node, ['message', 'text', 'caption', 'title', 'comment', 'body', 'value']);
  const text = attrText || node.textContent || '';
  return String(text).replace(/\s+/g, ' ').trim();
}

function workoutTextOffsetFromNode(node) {
  return parseDuration(readAttr(node, [
    'TimeOffset', 'timeoffset', 'Offset', 'Time', 'Start', 'At', 'StartTime', 'Seconds', 'When'
  ]));
}

function textNodesWithin(node) {
  const nodes = [];
  for (const child of [...(node?.children || [])]) {
    if (isWorkoutTextNode(child)) nodes.push(child);
    nodes.push(...textNodesWithin(child));
  }
  return nodes;
}

function estimateWorkoutNodeDuration(node) {
  const lower = String(node?.tagName || '').toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]/g, '');
  if (isWorkoutTextNode(node)) return 0;
  if (['intervalst', 'intervals', 'interval', 'repeatblock', 'repeats'].includes(normalized)) {
    const repeats = Math.max(1, Math.round(Number(readAttr(node, ['Repeat', 'Repeats', 'Repetitions', 'Count', 'repeat'])) || 1));
    let onDuration = parseDuration(readAttr(node, [
      'OnDuration', 'DurationOn', 'WorkDuration', 'HardDuration', 'HighDuration', 'IntervalDuration',
      'OnTime', 'WorkTime', 'HardTime', 'OnDur', 'WorkDur', 'HighDur'
    ]));
    let offDuration = parseDuration(readAttr(node, [
      'OffDuration', 'DurationOff', 'RestDuration', 'RecoveryDuration', 'LowDuration', 'EasyDuration',
      'OffTime', 'RestTime', 'RecoveryTime', 'OffDur', 'RestDur', 'LowDur', 'EasyDur'
    ]));
    const genericDuration = parseDuration(readAttr(node, ['Duration', 'duration']));
    if (!onDuration && !offDuration && genericDuration) onDuration = genericDuration;
    if (!onDuration && offDuration) onDuration = offDuration;
    if (!offDuration && onDuration && readAttr(node, ['OffPower', 'PowerOff', 'PowerLow', 'LowPower', 'RestPower', 'RecoveryPower'])) offDuration = onDuration;
    return repeats * ((onDuration || 0) + (offDuration || 0));
  }
  return parseDuration(readAttr(node, ['Duration', 'duration']));
}

function extractWorkoutComments(workoutNode, totalSeconds) {
  const comments = [];
  let cursor = 0;

  for (const child of [...workoutNode.children]) {
    if (isWorkoutTextNode(child)) {
      const message = workoutTextFromNode(child);
      if (message) comments.push({ time: Math.max(0, workoutTextOffsetFromNode(child) || cursor), message });
      continue;
    }

    for (const textNode of textNodesWithin(child)) {
      const message = workoutTextFromNode(textNode);
      if (!message) continue;
      const offset = workoutTextOffsetFromNode(textNode);
      comments.push({ time: Math.max(0, cursor + offset), message });
    }
    cursor += estimateWorkoutNodeDuration(child);
  }

  const seen = new Set();
  return comments
    .filter(item => item.message && Number.isFinite(item.time) && item.time >= 0 && item.time <= totalSeconds + 1)
    .sort((a, b) => a.time - b.time)
    .filter(item => {
      const key = `${Math.round(item.time)}|${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function workoutCommentKey(comment) {
  return `${Math.round(comment?.time || 0)}|${comment?.message || ''}`;
}

function showWorkoutMessage(message, title = 'Workout cue') {
  if (!els.workoutMessageOverlay || !els.workoutMessageText) {
    log(`Workout kommentar kunne ikke vises: mangler overlay-element.`);
    return;
  }
  window.clearTimeout(workoutMessageTimer);
  if (els.workoutMessageTitle) els.workoutMessageTitle.textContent = title;
  els.workoutMessageText.textContent = message;
  els.workoutMessageOverlay.hidden = false;
  // Force reflow, so the animation also works when two comments arrive close together.
  void els.workoutMessageOverlay.offsetHeight;
  els.workoutMessageOverlay.classList.add('show');
  workoutMessageTimer = window.setTimeout(hideWorkoutMessage, 8500);
  log(`Workout kommentar vist: ${title} · ${message}`);
}

function hideWorkoutMessage() {
  window.clearTimeout(workoutMessageTimer);
  workoutMessageTimer = null;
  if (!els.workoutMessageOverlay) return;
  els.workoutMessageOverlay.classList.remove('show');
  window.setTimeout(() => {
    if (!els.workoutMessageOverlay?.classList.contains('show')) els.workoutMessageOverlay.hidden = true;
  }, 220);
}

function clearWorkoutMessageSchedule() {
  for (const timer of workoutMessageTimers) window.clearTimeout(timer);
  workoutMessageTimers = [];
}

function showWorkoutComment(comment, workout) {
  if (!comment?.message) return false;
  const key = workoutCommentKey(comment);
  if (workoutState.shownMessages.has(key)) return false;
  workoutState.shownMessages.add(key);
  showWorkoutMessage(comment.message, `${formatClock(comment.time)} · ${workout?.name || 'Workout'}`);
  return true;
}

function scheduleWorkoutMessages() {
  clearWorkoutMessageSchedule();
  const workout = workoutState.workout;
  if (!workoutState.running || !workout?.comments?.length) return;
  const elapsed = currentWorkoutElapsedSeconds();
  for (const comment of workout.comments) {
    const key = workoutCommentKey(comment);
    if (workoutState.shownMessages.has(key)) continue;
    // Do not schedule comments that are clearly already missed, but allow a little slack after resume.
    if (comment.time < elapsed - 2) continue;
    const delayMs = Math.max(0, Math.round((comment.time - elapsed) * 1000));
    const timer = window.setTimeout(() => {
      if (!workoutState.running || workoutState.workout !== workout) return;
      showWorkoutComment(comment, workout);
    }, delayMs);
    workoutMessageTimers.push(timer);
  }
  log(`Workout kommentarer planlagt: ${workoutMessageTimers.length} tilbage.`);
}

function resetWorkoutMessages() {
  clearWorkoutMessageSchedule();
  workoutState.shownMessages = new Set();
  workoutState.lastMessageElapsed = 0;
  hideWorkoutMessage();
}

function checkWorkoutMessages(workout, elapsed) {
  // Fallback: catches comments if the browser throttles timers or the app jumps over a timestamp.
  if (!workoutState.running || !workout?.comments?.length) return;
  const previous = Math.max(0, workoutState.lastMessageElapsed || 0);
  const current = Math.max(previous, elapsed);
  for (const comment of workout.comments) {
    if (workoutState.shownMessages.has(workoutCommentKey(comment))) continue;
    const crossed = comment.time <= current + 0.75 && comment.time >= previous - 0.75;
    const recentlyMissed = comment.time < current && current - comment.time <= 6;
    if (crossed || recentlyMissed) {
      showWorkoutComment(comment, workout);
      break;
    }
  }
  workoutState.lastMessageElapsed = current;
}

function parseZwoWorkout(text, filename = 'Workout') {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Workout-filen er ikke gyldig XML/ZWO.');

  const workoutNode = doc.querySelector('workout');
  if (!workoutNode) throw new Error('ZWO-filen mangler <workout>.');

  const name = (doc.querySelector('name')?.textContent || filename.replace(/\.zwo$/i, '') || 'Workout').trim();
  const blocks = [];

  for (const child of [...workoutNode.children]) {
    const tag = child.tagName;
    const lower = tag.toLowerCase();

    if (['intervalst', 'intervals', 'interval', 'repeatblock', 'repeats'].includes(lower.replace(/[^a-z0-9]/g, ''))) {
      const repeats = Math.max(1, Math.round(Number(readAttr(child, ['Repeat', 'Repeats', 'Repetitions', 'Count', 'repeat'])) || 1));
      let onDuration = parseDuration(readAttr(child, [
        'OnDuration', 'DurationOn', 'WorkDuration', 'HardDuration', 'HighDuration', 'IntervalDuration',
        'OnTime', 'WorkTime', 'HardTime', 'OnDur', 'WorkDur', 'HighDur'
      ]));
      let offDuration = parseDuration(readAttr(child, [
        'OffDuration', 'DurationOff', 'RestDuration', 'RecoveryDuration', 'LowDuration', 'EasyDuration',
        'OffTime', 'RestTime', 'RecoveryTime', 'OffDur', 'RestDur', 'LowDur', 'EasyDur'
      ]));
      const genericDuration = parseDuration(readAttr(child, ['Duration', 'duration']));
      if (!onDuration && !offDuration && genericDuration) onDuration = genericDuration;
      if (!onDuration && offDuration && readAttr(child, ['OnPower', 'PowerOn', 'PowerHigh', 'HighPower', 'TargetPower', 'WorkPower'])) onDuration = offDuration;
      if (!offDuration && onDuration && readAttr(child, ['OffPower', 'PowerOff', 'PowerLow', 'LowPower', 'RestPower', 'RecoveryPower'])) offDuration = onDuration;
      const onPower = parsePercent(readAttr(child, [
        'OnPower', 'PowerOn', 'WorkPower', 'HardPower', 'HighPower', 'PowerHigh', 'OnPowerHigh',
        'PowerOnHigh', 'TargetPower', 'TargetWatts', 'OnWatts', 'WattsOn', 'Power',
        'OnWattsPercent', 'WorkWattsPercent', 'HighWattsPercent', 'WattsHigh'
      ]));
      const offPower = parsePercent(readAttr(child, [
        'OffPower', 'PowerOff', 'RestPower', 'RecoveryPower', 'EasyPower', 'LowPower', 'PowerLow',
        'OffPowerLow', 'PowerOffLow', 'RestWatts', 'WattsOff', 'OffWattsPercent',
        'RestWattsPercent', 'RecoveryWattsPercent', 'WattsLow'
      ]));
      for (let index = 0; index < repeats; index += 1) {
        if (onDuration) blocks.push(makeWorkoutBlock({ name: `Interval ${index + 1}`, duration: onDuration, power: onPower }));
        if (offDuration) blocks.push(makeWorkoutBlock({ name: `Pause ${index + 1}`, duration: offDuration, power: offPower }));
      }
      continue;
    }

    const duration = parseDuration(readAttr(child, ['Duration', 'duration']));
    if (!duration) continue;

    if (lower === 'freeride') {
      blocks.push(makeWorkoutBlock({ name: 'FreeRide', duration, freeRide: true }));
      continue;
    }

    const power = parsePercent(readAttr(child, ['Power', 'TargetPower', 'Watts', 'TargetWatts', 'power']));
    const powerLow = parsePercent(readAttr(child, ['PowerLow', 'LowPower', 'StartPower', 'PowerStart', 'FromPower', 'powerLow']));
    const powerHigh = parsePercent(readAttr(child, ['PowerHigh', 'HighPower', 'EndPower', 'PowerEnd', 'ToPower', 'powerHigh']));
    blocks.push(makeWorkoutBlock({ name: blockNameFromTag(tag), duration, power, powerLow, powerHigh }));
  }

  if (!blocks.length) throw new Error('Der blev ikke fundet brugbare workout-blokke i filen.');

  let cursor = 0;
  for (const block of blocks) {
    block.start = cursor;
    cursor += block.duration;
    block.end = cursor;
  }

  const comments = extractWorkoutComments(workoutNode, cursor);
  return { name, source: filename, blocks, totalSeconds: cursor, comments };
}

function workoutBlockMultiplier(block, preferHigh = true) {
  if (!block || block.freeRide) return 0.5;
  if (preferHigh && Number.isFinite(block.powerHigh)) return block.powerHigh;
  if (!preferHigh && Number.isFinite(block.powerLow)) return block.powerLow;
  if (Number.isFinite(block.power)) return block.power;
  if (Number.isFinite(block.powerHigh)) return block.powerHigh;
  if (Number.isFinite(block.powerLow)) return block.powerLow;
  return 0.5;
}

function workoutGraphClassForBlock(block) {
  if (!block || block.freeRide) return 'free';
  const multiplier = workoutBlockMultiplier(block, true);
  if (multiplier < 0.56) return 'z1';
  if (multiplier < 0.76) return 'z2';
  if (multiplier < 0.91) return 'z3';
  if (multiplier < 1.06) return 'z4';
  if (multiplier < 1.21) return 'z5';
  return 'z6';
}

function workoutGraphMaxMultiplier(workout) {
  const values = (workout?.blocks || []).map(block => workoutBlockMultiplier(block, true)).filter(Number.isFinite);
  const observedMax = values.length ? Math.max(...values) : 1;
  // Fast-ish skala gør Z2 lav, threshold tydelig og VO2 høj. Uden det bliver hele kurven flad,
  // især hvis en fil indeholder mærkelige eller meget høje values.
  return Math.max(1.2, Math.min(1.55, observedMax));
}

function workoutGraphY(multiplier, maxMultiplier) {
  const minMultiplier = 0.30;
  const safeMax = Math.max(1.2, maxMultiplier || 1.2);
  const clamped = Math.max(minMultiplier, Math.min(safeMax, multiplier || minMultiplier));
  const available = WORKOUT_GRAPH_BASE - WORKOUT_GRAPH_TOP;
  const normalized = (clamped - minMultiplier) / (safeMax - minMultiplier);
  const height = Math.max(WORKOUT_GRAPH_MIN_HEIGHT, normalized * available);
  return WORKOUT_GRAPH_BASE - height;
}

function renderWorkoutGraph(workout, elapsed = 0, force = false) {
  if (!els.workoutGraphBlocks || !els.workoutGraphCursor) return;

  if (!workout) {
    workoutGraphRenderKey = '';
    els.workoutGraphBlocks.replaceChildren();
    els.workoutGraphCursor.setAttribute('opacity', '0');
    els.workoutGraphCursorDot?.setAttribute('opacity', '0');
    if (els.workoutGraphNow) els.workoutGraphNow.textContent = '00:00 / --:--';
    return;
  }

  const blockSignature = workout.blocks.map(block => `${block.start}:${block.end}:${block.freeRide ? 'free' : block.power ?? ''}:${block.powerLow ?? ''}:${block.powerHigh ?? ''}`).join('|');
  const renderKey = `${workout.name}|${workout.totalSeconds}|${blockSignature}`;

  if (force || renderKey !== workoutGraphRenderKey) {
    workoutGraphRenderKey = renderKey;
    const maxMultiplier = workoutGraphMaxMultiplier(workout);
    if (els.workoutWattScale) {
      const ftp = Math.max(1, Number(workoutState.ftp) || readStoredFtp());
      const maxWatts = Math.ceil((maxMultiplier * ftp) / 50) * 50;
      const labels = els.workoutWattScale.querySelectorAll('span');
      labels.forEach((label, index) => {
        const watts = Math.round(maxWatts * (1 - index / Math.max(1, labels.length - 1)));
        label.textContent = `${watts} W`;
      });
    }
    const fragment = document.createDocumentFragment();

    for (const [blockIndex, block] of workout.blocks.entries()) {
      const duration = Number.isFinite(Number(block.duration))
        ? Number(block.duration)
        : Math.max(0, Number(block.end) - Number(block.start));
      const x = (Number(block.start) / workout.totalSeconds) * WORKOUT_GRAPH_WIDTH;
      const width = Math.max(1.2, (duration / workout.totalSeconds) * WORKOUT_GRAPH_WIDTH);
      const x2 = Math.min(WORKOUT_GRAPH_WIDTH, x + width);
      const zoneClass = workoutGraphClassForBlock(block);
      const cls = `workout-graph-block ${zoneClass}`;
      const fillByZone = {
        z1: '#dbe5f1',
        z2: '#69b8ff',
        z3: '#2dc689',
        z4: '#ffd126',
        z5: '#f39a43',
        z6: '#ec5b70',
        free: '#a7b4c2'
      };
      const blockFill = fillByZone[zoneClass] || '#dbe5f1';

      if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) {
        console.warn('Workout-blok kunne ikke tegnes', block);
        continue;
      }

      if (!block.freeRide && Number.isFinite(block.powerLow) && Number.isFinite(block.powerHigh) && block.powerLow !== block.powerHigh) {
        const y1 = workoutGraphY(block.powerLow, maxMultiplier);
        const y2 = workoutGraphY(block.powerHigh, maxMultiplier);
        const shape = document.createElementNS(SVG_NS, 'path');
        shape.setAttribute('class', `${cls} ramp`);
        shape.dataset.blockIndex = String(blockIndex);
        shape.setAttribute('fill', blockFill);
        shape.setAttribute('stroke', 'rgba(255,255,255,.82)');
        shape.setAttribute('stroke-width', '0.8');
        shape.setAttribute('d', `M ${x.toFixed(2)} ${WORKOUT_GRAPH_BASE} L ${x.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x2.toFixed(2)} ${WORKOUT_GRAPH_BASE} Z`);
        fragment.appendChild(shape);
      } else {
        const multiplier = workoutBlockMultiplier(block, true);
        const y = workoutGraphY(multiplier, maxMultiplier);
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', cls);
        rect.dataset.blockIndex = String(blockIndex);
        rect.setAttribute('fill', blockFill);
        rect.setAttribute('stroke', 'rgba(255,255,255,.82)');
        rect.setAttribute('stroke-width', '0.8');
        rect.setAttribute('x', x.toFixed(2));
        rect.setAttribute('y', y.toFixed(2));
        rect.setAttribute('width', width.toFixed(2));
        rect.setAttribute('height', (WORKOUT_GRAPH_BASE - y).toFixed(2));
        rect.setAttribute('rx', '5');
        fragment.appendChild(rect);
      }
    }

    els.workoutGraphBlocks.replaceChildren(fragment);
  }

  const cursorX = workout.totalSeconds > 0 ? Math.max(0, Math.min(WORKOUT_GRAPH_WIDTH, (elapsed / workout.totalSeconds) * WORKOUT_GRAPH_WIDTH)) : 0;
  els.workoutGraphCursor.setAttribute('x1', cursorX.toFixed(2));
  els.workoutGraphCursor.setAttribute('x2', cursorX.toFixed(2));
  els.workoutGraphCursor.setAttribute('opacity', '1');
  if (els.workoutGraphCursorDot) {
    els.workoutGraphCursorDot.setAttribute('cx', cursorX.toFixed(2));
    els.workoutGraphCursorDot.setAttribute('opacity', '1');
  }
  const activeIndex = workout.blocks.findIndex(block => elapsed >= block.start && elapsed < block.end);
  els.workoutGraphBlocks.querySelectorAll('[data-block-index]').forEach(node => {
    const nodeIndex = Number(node.dataset.blockIndex);
    node.classList.toggle('is-complete', activeIndex >= 0 && nodeIndex < activeIndex);
    node.classList.toggle('is-active', nodeIndex === activeIndex);
    node.classList.toggle('is-upcoming', activeIndex >= 0 && nodeIndex > activeIndex);
  });
  if (els.workoutGraphNow) els.workoutGraphNow.textContent = `${formatClock(elapsed)} / ${formatClock(workout.totalSeconds)}`;
}

function currentWorkoutElapsedSeconds() {
  if (!workoutState.workout || !workoutState.startedAt) return 0;
  const now = workoutState.pausedAt || Date.now();
  return Math.max(0, Math.min(workoutState.workout.totalSeconds, (now - workoutState.startedAt - workoutState.pausedMs) / 1000));
}

function currentWorkoutBlock() {
  const workout = workoutState.workout;
  if (!workout) return { block: null, index: -1, elapsed: 0 };
  const elapsed = currentWorkoutElapsedSeconds();
  const index = workout.blocks.findIndex(block => elapsed >= block.start && elapsed < block.end);
  if (index === -1) {
    const lastIndex = workout.blocks.length - 1;
    return { block: workout.blocks[lastIndex], index: lastIndex, elapsed };
  }
  return { block: workout.blocks[index], index, elapsed };
}

function targetPowerForBlock(block, elapsedInBlock) {
  if (!block || block.freeRide) return null;
  let multiplier = null;
  if (Number.isFinite(block.powerLow) && Number.isFinite(block.powerHigh)) {
    const ratio = block.duration > 0 ? Math.max(0, Math.min(1, elapsedInBlock / block.duration)) : 0;
    multiplier = block.powerLow + ((block.powerHigh - block.powerLow) * ratio);
  } else if (Number.isFinite(block.power)) {
    multiplier = block.power;
  }
  if (!Number.isFinite(multiplier)) return null;
  return Math.max(0, Math.round(multiplier * workoutState.ftp));
}

function currentWorkoutTargetPower() {
  const { block, elapsed } = currentWorkoutBlock();
  if (!block) return null;
  return targetPowerForBlock(block, elapsed - block.start);
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function workoutBlockSummary(block) {
  if (!block) return '—';
  return `${block.name} · ${blockPowerLabel(block)}`;
}

function setWorkoutLoaded(workout) {
  workoutState.workout = workout;
  workoutState.startedAt = null;
  workoutState.pausedAt = null;
  workoutState.pausedMs = 0;
  workoutState.running = false;
  resetWorkoutMessages();
  if (els.workoutStartPauseButton) {
    els.workoutStartPauseButton.disabled = false;
    els.workoutStartPauseButton.innerHTML = '<span class="button-icon">▶</span>Start workout';
  }
  if (els.workoutResetButton) els.workoutResetButton.disabled = false;
  if (els.workoutImportStatus) els.workoutImportStatus.textContent = workout.name;
  if (els.workoutImportSummary) els.workoutImportSummary.textContent = `${formatClock(workout.totalSeconds)} · ${workout.blocks.length} blokke · ${(workout.comments || []).length} kommentarer · ${workout.source}`;
  showToast(`Workout importeret · ${workout.name}`);
  const commentPreview = (workout.comments || []).slice(0, 4).map(item => `${formatClock(item.time)} ${item.message}`).join(' | ');
  log(`Workout importeret: ${workout.name} (${workout.blocks.length} blokke, ${(workout.comments || []).length} kommentarer). ${commentPreview ? `Kommentarer: ${commentPreview}` : 'Ingen kommentarer fundet.'}`);
  updateWorkoutUi(true);
}

async function importWorkoutFile(file) {
  if (!file) return;
  const text = await file.text();
  const workout = parseZwoWorkout(text, file.name);
  setWorkoutLoaded(workout);
  setSettingsOpen(false);
}

async function toggleWorkoutStartPause() {
  if (!workoutState.workout) return;
  if (!workoutState.startedAt) {
    workoutState.startedAt = Date.now();
    workoutState.pausedAt = null;
    workoutState.pausedMs = 0;
    workoutState.running = true;
    workoutState.lastMessageElapsed = 0;
    scheduleWorkoutMessages();
    showToast(workoutState.workout.comments?.length ? `Workout startet · ${workoutState.workout.comments.length} kommentarer aktiveret` : 'Workout startet');
    await syncErgToWorkout(true);
  } else if (workoutState.running) {
    workoutState.pausedAt = Date.now();
    workoutState.running = false;
    clearWorkoutMessageSchedule();
    showToast('Workout pauset');
    await releaseErgControl('workout pauset');
  } else {
    workoutState.pausedMs += Date.now() - (workoutState.pausedAt || Date.now());
    workoutState.pausedAt = null;
    workoutState.running = true;
    workoutState.lastMessageElapsed = currentWorkoutElapsedSeconds();
    scheduleWorkoutMessages();
    showToast('Workout fortsætter');
    await syncErgToWorkout(true);
  }
  updateWorkoutUi(true);
}

function resetWorkout() {
  releaseErgControl('workout nulstillet').catch(error => log(`ERG reset-fejl: ${error.message}`));
  workoutState.startedAt = null;
  workoutState.pausedAt = null;
  workoutState.pausedMs = 0;
  workoutState.running = false;
  resetWorkoutMessages();
  updateWorkoutUi(true);
}

function workoutIntervalPresentation(block) {
  if (!block) return { icon: '○', kind: 'neutral' };
  if (block.freeRide) return { icon: '∞', kind: 'free' };
  const multiplier = workoutBlockMultiplier(block, true);
  if (multiplier < 0.60) return { icon: '↺', kind: 'recovery' };
  if (multiplier < 0.80) return { icon: '●', kind: 'endurance' };
  if (multiplier < 0.95) return { icon: '◆', kind: 'sweetspot' };
  if (multiplier < 1.08) return { icon: '⚡', kind: 'threshold' };
  return { icon: '▲', kind: 'sprint' };
}

function animateTargetChange(target) {
  const strip = els.workoutTargetPower?.closest('.v3-target-strip');
  if (!strip) return;
  const value = String(target ?? '');
  if (strip.dataset.targetValue === value) return;
  strip.dataset.targetValue = value;
  strip.classList.remove('target-changed');
  void strip.offsetWidth;
  strip.classList.add('target-changed');
}

function intervalWattDetails(block, elapsedInBlock = 0) {
  if (!block) return { target: '-- W', range: '--' };
  const target = targetPowerForBlock(block, Math.max(0, elapsedInBlock));
  if (!Number.isFinite(target)) return { target: 'FRI', range: 'Fri effekt' };
  const low = Math.round(target * 0.90);
  const high = Math.round(target * 1.10);
  return { target: `${target} W`, range: `${low}–${high} W` };
}

function updateWorkoutUi(force = false) {
  const workout = workoutState.workout;
  if (!els.workoutPanelTitle) return;

  if (!workout) {
    els.workoutPanelTitle.textContent = 'Ingen workout valgt';
    if (els.activeWorkoutLabel) els.activeWorkoutLabel.textContent = 'Ingen workout valgt';
    if (els.workoutStatePill) els.workoutStatePill.textContent = 'Klar';
    if (els.workoutTargetPower) {
      els.workoutTargetPower.textContent = '--';
    }
    if (els.workoutTargetNote) els.workoutTargetNote.textContent = 'Importer .zwo i indstillinger';
    if (els.workoutBlockTime) els.workoutBlockTime.textContent = '--:--';
    if (els.workoutBlockLabel) els.workoutBlockLabel.textContent = 'Ingen aktiv blok';
    if (els.workoutElapsed) els.workoutElapsed.textContent = '00:00';
    if (els.workoutRemaining) els.workoutRemaining.textContent = '--:--';
    if (els.workoutProgressFill) els.workoutProgressFill.style.width = '0%';
    renderWorkoutGraph(null);
    if (els.workoutNextBlock) els.workoutNextBlock.textContent = 'Importer en workout';
    if (els.currentIntervalWatts) els.currentIntervalWatts.textContent = '-- W';
    if (els.currentIntervalRange) els.currentIntervalRange.textContent = '--';
    if (els.nextIntervalWatts) els.nextIntervalWatts.textContent = '-- W';
    if (els.nextIntervalRange) els.nextIntervalRange.textContent = '--';
    return;
  }

  const elapsed = currentWorkoutElapsedSeconds();
  const complete = elapsed >= workout.totalSeconds;
  if (complete && workoutState.running) {
    workoutState.running = false;
    workoutState.pausedAt = Date.now();
    clearWorkoutMessageSchedule();
    if (!force) showToast('Workout færdig');
    releaseErgControl('workout færdig').catch(error => log(`ERG afslutningsfejl: ${error.message}`));
  }

  const { block, index } = currentWorkoutBlock();
  const blockElapsed = block ? Math.max(0, elapsed - block.start) : 0;
  const target = targetPowerForBlock(block, blockElapsed);
  const remaining = Math.max(0, workout.totalSeconds - elapsed);
  const blockRemaining = block ? Math.max(0, block.end - elapsed) : 0;
  const nextBlock = workout.blocks[index + 1] || null;
  const progress = workout.totalSeconds > 0 ? Math.min(100, (elapsed / workout.totalSeconds) * 100) : 0;
  renderWorkoutGraph(workout, elapsed, force);
  checkWorkoutMessages(workout, elapsed);

  els.workoutPanelTitle.textContent = workout.name;
  if (els.activeWorkoutLabel) els.activeWorkoutLabel.textContent = workout.name;
  if (els.workoutStatePill) {
    els.workoutStatePill.textContent = complete ? 'Færdig' : workoutState.running ? 'Kører' : workoutState.startedAt ? 'Pause' : 'Klar';
    els.workoutStatePill.className = `workout-state-pill ${workoutState.running ? 'running' : complete ? 'done' : ''}`;
  }
  if (els.workoutTargetPower) {
    els.workoutTargetPower.textContent = target === null ? 'FRI' : String(target);
  }
  if (els.workoutTargetLabel) els.workoutTargetLabel.textContent = target === null ? 'FreeRide' : 'Target watt';
  if (els.workoutTargetNote) els.workoutTargetNote.textContent = target === null ? 'Kør efter følelse / testblok' : `${blockPowerLabel(block)} af FTP ${workoutState.ftp} W`;
  if (els.workoutBlockTime) els.workoutBlockTime.textContent = formatClock(blockRemaining);
  if (els.workoutBlockLabel) els.workoutBlockLabel.textContent = workoutBlockSummary(block);
  const currentPresentation = workoutIntervalPresentation(block);
  const nextPresentation = workoutIntervalPresentation(nextBlock);
  if (els.currentIntervalIcon) {
    els.currentIntervalIcon.textContent = currentPresentation.icon;
    els.currentIntervalIcon.dataset.kind = currentPresentation.kind;
  }
  if (els.nextIntervalIcon) {
    els.nextIntervalIcon.textContent = nextPresentation.icon;
    els.nextIntervalIcon.dataset.kind = nextPresentation.kind;
  }
  animateTargetChange(target);
  if (els.workoutElapsed) els.workoutElapsed.textContent = formatClock(elapsed);
  if (els.workoutRemaining) els.workoutRemaining.textContent = `-${formatClock(remaining)}`;
  if (els.workoutProgressFill) els.workoutProgressFill.style.width = `${progress}%`;
  if (els.workoutNextBlock) els.workoutNextBlock.textContent = nextBlock ? workoutBlockSummary(nextBlock) : complete ? 'Færdig' : 'Sidste blok';
  const currentWattDetails = intervalWattDetails(block, blockElapsed);
  const nextWattDetails = intervalWattDetails(nextBlock, 0);
  if (els.currentIntervalWatts) els.currentIntervalWatts.textContent = currentWattDetails.target;
  if (els.currentIntervalRange) els.currentIntervalRange.textContent = currentWattDetails.range;
  if (els.nextIntervalWatts) els.nextIntervalWatts.textContent = nextWattDetails.target;
  if (els.nextIntervalRange) els.nextIntervalRange.textContent = nextWattDetails.range;
  if (els.workoutStartPauseButton) {
    els.workoutStartPauseButton.disabled = !workout;
    els.workoutStartPauseButton.innerHTML = workoutState.running ? '<span class="button-icon">Ⅱ</span>Pause workout' : workoutState.startedAt && !complete ? '<span class="button-icon">▶</span>Fortsæt workout' : '<span class="button-icon">▶</span>Start workout';
  }
  updateErgUi();
  syncErgToWorkout(false).catch(error => log(`ERG sync-fejl: ${error.message}`));
}

function nullableNumber(value, digits = null) {
  if (!Number.isFinite(value)) return null;
  return digits === null ? value : Number(value.toFixed(digits));
}

function setRideActiveUi(active) {
  if (!els.stopRideButton) return;
  els.stopRideButton.hidden = !active;
  els.stopRideButton.disabled = !active;
}

function recordRideSample(force = false) {
  if (!currentRide || currentRide.status !== 'active') return;

  const now = Date.now();
  const elapsedMs = Math.max(0, now - currentRide.startedAtMs);
  const wholeSecond = Math.floor(elapsedMs / 1000);
  if (wholeSecond === currentRide.lastSampleSecond) {
    if (!force || !currentRide.samples.length) return;
    currentRide.samples.pop();
  }

  currentRide.samples.push({
    t: Number((elapsedMs / 1000).toFixed(3)),
    timestamp: new Date(now).toISOString(),
    power: nullableNumber(session.currentPower),
    heartRate: nullableNumber(session.currentHeartRate),
    cadence: nullableNumber(session.currentCadence),
    speedKmh: nullableNumber(session.currentSpeedKph, 2),
    distanceKm: nullableNumber(Math.max(0, session.distanceMeters) / 1000, 4),
    targetPower: nullableNumber(currentWorkoutTargetPower()),
  });
  currentRide.lastSampleSecond = wholeSecond;
}

function stopRideLogging() {
  if (rideLoggingTimer !== null) {
    window.clearInterval(rideLoggingTimer);
    rideLoggingTimer = null;
  }
}

function startRideRecording(startedAtMs = Date.now()) {
  if (currentRide || rideLoggingTimer !== null) return;

  currentRide = {
    version: RIDE_FILE_VERSION,
    rideId: createRideId(startedAtMs),
    startTime: new Date(startedAtMs).toISOString(),
    startedAtMs,
    endTime: null,
    endedAtMs: null,
    status: 'active',
    samples: [],
    lastSampleSecond: -1,
  };
  recordRideSample(true);
  rideLoggingTimer = window.setInterval(recordRideSample, 1000);
  setRideActiveUi(true);
  if (els.rideSaveStatus) els.rideSaveStatus.textContent = 'Tur optages';
  log(`Ride recording startet: ${currentRide.rideId}`);
}

function sampleValues(ride, key) {
  return ride.samples.map(sample => sample[key]).filter(Number.isFinite);
}

function averageOrNull(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function maximumOrNull(values) {
  return values.length ? values.reduce((maximum, value) => Math.max(maximum, value), values[0]) : null;
}

function buildRideFile(ride) {
  const power = sampleValues(ride, 'power');
  const heartRate = sampleValues(ride, 'heartRate');
  const cadence = sampleValues(ride, 'cadence');
  return {
    version: ride.version,
    rideId: ride.rideId,
    startTime: ride.startTime,
    endTime: ride.endTime,
    workout: workoutState.workout ? {
      name: workoutState.workout.name,
      source: workoutState.workout.source,
      totalSeconds: workoutState.workout.totalSeconds,
      ftp: workoutState.ftp,
    } : null,
    summary: {
      durationSec: Math.max(0, Math.round((ride.endedAtMs - ride.startedAtMs) / 1000)),
      distanceKm: nullableNumber(Math.max(0, session.distanceMeters) / 1000, 4),
      avgPower: averageOrNull(power),
      maxPower: maximumOrNull(power),
      avgHeartRate: averageOrNull(heartRate),
      maxHeartRate: maximumOrNull(heartRate),
      avgCadence: averageOrNull(cadence),
      maxCadence: maximumOrNull(cadence),
    },
    samples: ride.samples,
  };
}

function rideFilename(startTime) {
  const date = new Date(startTime);
  const pad = value => String(value).padStart(2, '0');
  return `ride-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

function openRideDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB understøttes ikke'));
      return;
    }
    const request = indexedDB.open(RIDE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RIDE_DB_STORE)) {
        request.result.createObjectStore(RIDE_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB kunne ikke åbnes'));
  });
}

async function readStoredRideDirectory() {
  const db = await openRideDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(RIDE_DB_STORE, 'readonly').objectStore(RIDE_DB_STORE).get(RIDE_DIRECTORY_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Gemmemappen kunne ikke læses'));
    });
  } finally {
    db.close();
  }
}

async function storeRideDirectory(handle) {
  const db = await openRideDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(RIDE_DB_STORE, 'readwrite').objectStore(RIDE_DB_STORE).put(handle, RIDE_DIRECTORY_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Gemmemappen kunne ikke huskes'));
    });
  } finally {
    db.close();
  }
}

async function directoryPermission(handle, request = false) {
  if (!handle) return false;
  const options = { mode: 'readwrite' };
  if (typeof handle.queryPermission !== 'function') return true;
  if (await handle.queryPermission(options) === 'granted') return true;
  return request && typeof handle.requestPermission === 'function'
    ? (await handle.requestPermission(options)) === 'granted'
    : false;
}

function fileSystemAccessSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

async function updateRideFolderStatus() {
  if (!els.rideFolderStatus) return;
  if (!fileSystemAccessSupported()) {
    els.rideFolderStatus.textContent = 'Mappevalg understøttes ikke – ture downloades i stedet.';
    if (els.chooseRideFolderButton) els.chooseRideFolderButton.hidden = true;
    return;
  }
  if (!rideDirectoryHandle) {
    els.rideFolderStatus.textContent = 'Ingen gemmemappe valgt';
    return;
  }
  const granted = await directoryPermission(rideDirectoryHandle, false).catch(() => false);
  els.rideFolderStatus.textContent = granted
    ? `Valgt mappe: ${rideDirectoryHandle.name}`
    : `Godkend adgang til: ${rideDirectoryHandle.name}`;
  if (els.chooseRideFolderButton) {
    els.chooseRideFolderButton.textContent = granted ? 'Vælg en anden gemmemappe' : 'Godkend gemmemappe';
  }
}

function downloadRideJson(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveCompletedRide({ requestPermission = false } = {}) {
  if (!currentRide || currentRide.status !== 'completed') return false;
  const filename = rideFilename(currentRide.startTime);
  const json = `${JSON.stringify(buildRideFile(currentRide), null, 2)}\n`;

  if (!fileSystemAccessSupported()) {
    downloadRideJson(json, filename);
  } else {
    if (!rideDirectoryHandle) {
      showToast('Vælg gemmemappe først');
      if (els.rideSaveStatus) els.rideSaveStatus.textContent = 'Turen er stoppet – vælg en gemmemappe';
      return false;
    }
    const permitted = await directoryPermission(rideDirectoryHandle, requestPermission).catch(() => false);
    if (!permitted) {
      showToast('Godkend gemmemappen igen');
      if (els.rideSaveStatus) els.rideSaveStatus.textContent = 'Turen er stoppet – godkend gemmemappen';
      await updateRideFolderStatus();
      return false;
    }
    const fileHandle = await rideDirectoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  log(`Tur gemt: ${filename}`);
  showToast(`Tur gemt · ${filename}`);
  if (els.rideSaveStatus) els.rideSaveStatus.textContent = `Tur gemt: ${filename}`;
  currentRide = null;
  resetSession(false);
  return true;
}

async function stopRide() {
  if (!currentRide || currentRide.status !== 'active') return;
  recordRideSample(true);
  stopRideLogging();
  currentRide.endedAtMs = Date.now();
  currentRide.endTime = new Date(currentRide.endedAtMs).toISOString();
  currentRide.status = 'completed';
  setRideActiveUi(false);
  log(`Tur afsluttet med ${currentRide.samples.length} samples.`);

  try {
    await saveCompletedRide({ requestPermission: true });
  } catch (error) {
    log(`Kunne ikke gemme tur: ${error.message}`);
    showToast('Turen kunne ikke gemmes');
    if (els.rideSaveStatus) els.rideSaveStatus.textContent = `Turen er stoppet – gemmefejl: ${error.message}`;
  }
}

async function chooseRideFolder() {
  if (!fileSystemAccessSupported()) return;
  try {
    const existingPermission = rideDirectoryHandle
      ? await directoryPermission(rideDirectoryHandle, false)
      : false;
    if (rideDirectoryHandle && !existingPermission && await directoryPermission(rideDirectoryHandle, true)) {
      await updateRideFolderStatus();
      showToast(`Gemmemappe godkendt · ${rideDirectoryHandle.name}`);
      if (currentRide?.status === 'completed') await saveCompletedRide();
      return;
    }
    rideDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    try {
      await storeRideDirectory(rideDirectoryHandle);
    } catch (error) {
      log(`Gemmemappen kunne ikke huskes: ${error.message}`);
    }
    await updateRideFolderStatus();
    showToast(`Gemmemappe valgt · ${rideDirectoryHandle.name}`);
    if (currentRide?.status === 'completed') await saveCompletedRide({ requestPermission: true });
  } catch (error) {
    if (error.name !== 'AbortError') {
      log(`Mappefejl: ${error.message}`);
      showToast('Gemmemappen kunne ikke vælges');
    }
  }
}

async function restoreRideDirectory() {
  if (!fileSystemAccessSupported()) {
    await updateRideFolderStatus();
    return;
  }
  try {
    rideDirectoryHandle = await readStoredRideDirectory();
  } catch (error) {
    log(`Kunne ikke genbruge gemmemappen: ${error.message}`);
  }
  await updateRideFolderStatus();
}

function updatePower(power) {
  if (!Number.isFinite(power) || power < 0) return;
  const cleanPower = Math.round(power);
  const now = Date.now();

  session.currentPower = cleanPower;
  ensureSessionStarted(cleanPower, session.currentCadence);

  session.powerSamples.push({ time: now, power: cleanPower });
  session.powerSamples = session.powerSamples.filter(sample => now - sample.time <= 600000);
  session.power3sSamples.push({ time: now, power: cleanPower });
  session.power3sSamples = session.power3sSamples.filter(sample => now - sample.time <= 3000);
  session.powerSum += cleanPower;
  session.powerCount += 1;
  session.maxPower = Math.max(session.maxPower, cleanPower);

  const average3s = session.power3sSamples.length
    ? Math.round(session.power3sSamples.reduce((sum, sample) => sum + sample.power, 0) / session.power3sSamples.length)
    : cleanPower;

  els.powerValue.textContent = String(average3s);
  els.averagePower.textContent = String(Math.round(session.powerSum / session.powerCount));
  els.maxPower.textContent = String(session.maxPower);
  els.powerZone.textContent = powerBand(average3s);
}

function setCadenceIconSpeed(cadence) {
  if (!els.cadenceIcon) return;
  const cleanCadence = Number.isFinite(cadence) ? Math.max(0, cadence) : 0;
  if (cleanCadence <= 0) {
    els.cadenceIcon.classList.remove('is-spinning');
    return;
  }

  // Én omdrejning i ikonet svarer til én pedalomdrejning.
  const secondsPerRevolution = Math.max(0.24, 60 / cleanCadence);
  els.cadenceIcon.style.setProperty('--cadence-duration', `${secondsPerRevolution.toFixed(3)}s`);
  els.cadenceIcon.classList.add('is-spinning');
}

function updateCadence(cadence) {
  if (!Number.isFinite(cadence)) return;
  const cleanCadence = Math.max(0, Math.min(250, Math.round(cadence)));
  session.currentCadence = cleanCadence;
  lastCadencePacketAt = Date.now();
  ensureSessionStarted(session.currentPower, cleanCadence);
  els.cadenceValue.textContent = String(cleanCadence);
  setRing(els.cadenceRing, cleanCadence, 120);
  setCadenceIconSpeed(cleanCadence);
}

function updateHeartRate(heartRate) {
  if (!Number.isFinite(heartRate) || heartRate <= 0) return;
  const cleanHeartRate = Math.min(240, Math.round(heartRate));
  const now = Date.now();
  session.currentHeartRate = cleanHeartRate;
  lastHeartRatePacketAt = now;
  session.heartRateSamples.push({ time: now, heartRate: cleanHeartRate });
  session.heartRateSamples = session.heartRateSamples.filter(sample => now - sample.time <= 600000);
  els.heartRateValue.textContent = String(cleanHeartRate);
  if (els.heartPulseIcon) {
    const beatSeconds = Math.max(0.28, Math.min(1.5, 60 / cleanHeartRate));
    els.heartPulseIcon.style.setProperty('--beat-duration', `${beatSeconds.toFixed(3)}s`);
    els.heartPulseIcon.classList.add('is-beating');
  }
  if (demoTimer) {
    setHeartRateStatus('connected', 'Simuleret pulsmåler', 'Testdata');
  } else {
    setHeartRateStatus('connected', heartRateDevice?.name || 'Pulsmåler', 'Forbundet');
  }
  setRing(els.heartRateRing, cleanHeartRate, 200);
  updateHeartRateChart();
}

function powerBand(power) {
  if (power < 100) return 'Let tråd';
  if (power < 180) return 'Roligt arbejde';
  if (power < 260) return 'Solid belastning';
  if (power < 360) return 'Hårdt arbejde';
  return 'Der bliver trådt igennem';
}

function updateElapsed() {
  updateWorkoutUi();
  if (!session.startedAt) {
    els.elapsedTime.textContent = '00:00';
  } else {
    const totalSeconds = Math.floor((Date.now() - session.startedAt) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    els.elapsedTime.textContent = hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (session.currentCadence !== null && Date.now() - lastCadencePacketAt > 2800) {
    session.currentCadence = 0;
    els.cadenceValue.textContent = '0';
    setRing(els.cadenceRing, 0, 120);
    setCadenceIconSpeed(0);
  }
  if (session.currentHeartRate !== null && Date.now() - lastHeartRatePacketAt > 6000) {
    session.currentHeartRate = null;
    els.heartRateValue.textContent = '--';
    if (heartRateDevice?.gatt?.connected) {
      setHeartRateStatus('connected', heartRateDevice.name || 'Pulsmåler', 'Venter på pulsdata');
    } else {
      setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
    }
    setRing(els.heartRateRing, 0, 200);
    updateHeartRateChart(true, false);
  }
}

function resetSession(showMessage = true) {
  if (currentRide) {
    if (showMessage) {
      showToast(currentRide.status === 'active'
        ? 'Stop turen, før du nulstiller'
        : 'Gem den afsluttede tur, før du nulstiller');
    }
    return;
  }
  session.startedAt = null;
  session.powerSamples = [];
  session.power3sSamples = [];
  session.powerSum = 0;
  session.powerCount = 0;
  session.maxPower = 0;
  session.currentPower = null;
  session.currentCadence = null;
  session.currentHeartRate = null;
  session.heartRateSamples = [];
  session.heartChartMin = null;
  session.heartChartMax = null;
  session.distanceMeters = 0;
  session.distanceMode = null;
  session.currentSpeedKph = null;
  session.previousSpeedKph = null;
  session.lastSpeedAt = null;
  session.ftmsLastRawMeters = null;
  session.ftmsLastAt = null;
  crankState.power.revolutions = null;
  crankState.power.eventTime = null;
  crankState.csc.revolutions = null;
  crankState.csc.eventTime = null;
  els.powerValue.textContent = '--';
  els.cadenceValue.textContent = '--';
  els.averagePower.textContent = '--';
  els.maxPower.textContent = '--';
  els.elapsedTime.textContent = '00:00';
  els.powerZone.textContent = 'Venter på data';
  els.heartRateValue.textContent = '--';
  renderDistance();
  setRing(els.cadenceRing, 0, 120);
  setCadenceIconSpeed(0);
  setRing(els.heartRateRing, 0, 200);
  updateHeartRateChart(true, false);
  if (showMessage) showToast('Turdata er nulstillet');
}

function readUint24LE(view, offset) {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

function calculateCadence(source, cumulativeRevolutions, eventTime, timeResolution) {
  const previous = crankState[source];
  let cadence = null;

  if (previous.revolutions !== null && previous.eventTime !== null) {
    const revDelta = (cumulativeRevolutions - previous.revolutions + 65536) % 65536;
    const timeDeltaTicks = (eventTime - previous.eventTime + 65536) % 65536;
    const seconds = timeDeltaTicks / timeResolution;

    if (seconds > 0 && revDelta > 0 && revDelta < 20) {
      cadence = (revDelta / seconds) * 60;
    }
  }

  previous.revolutions = cumulativeRevolutions;
  previous.eventTime = eventTime;
  return cadence;
}

function handleCyclingPower(event) {
  const view = event.target.value;
  if (!view || view.byteLength < 4) return;

  const flags = view.getUint16(0, true);
  const power = view.getInt16(2, true);
  let offset = 4;

  updatePower(power);

  if (flags & (1 << 0)) offset += 1; // Pedal Power Balance
  if (flags & (1 << 2)) offset += 2; // Accumulated Torque
  if (flags & (1 << 4)) offset += 6; // Wheel Revolution Data

  if (flags & (1 << 5)) {
    if (offset + 4 <= view.byteLength) {
      const crankRevolutions = view.getUint16(offset, true);
      const crankEventTime = view.getUint16(offset + 2, true);
      const cadence = calculateCadence('power', crankRevolutions, crankEventTime, 1024);
      if (cadence !== null) updateCadence(cadence);
    }
    offset += 4;
  }
}

function handleCsc(event) {
  const view = event.target.value;
  if (!view || view.byteLength < 1) return;

  const flags = view.getUint8(0);
  let offset = 1;

  if (flags & 0x01) offset += 6; // Wheel data
  if ((flags & 0x02) && offset + 4 <= view.byteLength) {
    const crankRevolutions = view.getUint16(offset, true);
    const crankEventTime = view.getUint16(offset + 2, true);
    const cadence = calculateCadence('csc', crankRevolutions, crankEventTime, 1024);
    if (cadence !== null) updateCadence(cadence);
  }
}

function handleIndoorBikeData(event) {
  const view = event.target.value;
  if (!view || view.byteLength < 2) return;

  const flags = view.getUint16(0, true);
  let offset = 2;
  let instantaneousSpeed = null;
  let totalDistance = null;
  let instantaneousCadence = null;
  let instantaneousPower = null;
  let heartRate = null;

  const readField = (size, reader) => {
    const value = offset + size <= view.byteLength ? reader(offset) : null;
    offset += size;
    return value;
  };

  // Bit 0 is "More Data". Instantaneous speed is present when it is NOT set.
  if (!(flags & (1 << 0))) instantaneousSpeed = readField(2, position => view.getUint16(position, true) / 100);
  if (flags & (1 << 1)) readField(2, () => null); // Average speed

  if (flags & (1 << 2)) {
    instantaneousCadence = readField(2, position => view.getUint16(position, true) / 2);
  }
  if (flags & (1 << 3)) readField(2, () => null); // Average cadence
  if (flags & (1 << 4)) totalDistance = readField(3, position => readUint24LE(view, position));
  if (flags & (1 << 5)) readField(2, () => null); // Resistance level

  if (flags & (1 << 6)) {
    instantaneousPower = readField(2, position => view.getInt16(position, true));
  }

  if (flags & (1 << 7)) readField(2, () => null); // Average power
  if (flags & (1 << 8)) readField(5, () => null); // Expended energy
  if (flags & (1 << 9)) {
    heartRate = readField(1, position => view.getUint8(position));
  }
  if (flags & (1 << 10)) readField(1, () => null); // MET
  if (flags & (1 << 11)) readField(2, () => null); // Elapsed time
  if (flags & (1 << 12)) readField(2, () => null); // Remaining time

  const now = Date.now();
  if (totalDistance !== null) updateFtmsDistance(totalDistance, now, instantaneousSpeed);
  else if (instantaneousSpeed !== null) updateSpeedDistance(instantaneousSpeed, now);
  if (instantaneousCadence !== null) updateCadence(instantaneousCadence);
  if (ftmsPowerEnabled && instantaneousPower !== null) updatePower(instantaneousPower);
  if (heartRate !== null) updateHeartRate(heartRate);
}

async function subscribe(service, characteristicUuid, handler, label) {
  const characteristic = await service.getCharacteristic(characteristicUuid);
  characteristic.addEventListener('characteristicvaluechanged', handler);
  await characteristic.startNotifications();
  subscribedCharacteristics.push({ characteristic, handler });
  log(`Abonnerer på ${label}.`);
}

async function setupDataServices(server) {
  subscribedCharacteristics = [];
  resetErgConnection();
  const sources = [];
  let hasPower = false;
  ftmsPowerEnabled = false;

  try {
    const powerService = await server.getPrimaryService(UUID.cyclingPowerService);
    await subscribe(powerService, UUID.cyclingPowerMeasurement, handleCyclingPower, 'Cycling Power Measurement');
    sources.push('Cycling Power');
    hasPower = true;
  } catch (error) {
    log(`Cycling Power ikke tilgængelig: ${error.message}`);
  }

  try {
    const cscService = await server.getPrimaryService(UUID.cscService);
    await subscribe(cscService, UUID.cscMeasurement, handleCsc, 'Cycling Speed and Cadence');
    sources.push('CSC');
  } catch (error) {
    log(`CSC ikke tilgængelig: ${error.message}`);
  }

  try {
    const ftmsService = await server.getPrimaryService(UUID.fitnessMachineService);
    ftmsPowerEnabled = !hasPower;
    await subscribe(ftmsService, UUID.indoorBikeData, handleIndoorBikeData, 'FTMS Indoor Bike Data');
    await setupFtmsControl(ftmsService);
    sources.push('FTMS');
    if (ftmsPowerEnabled) hasPower = true;
  } catch (error) {
    ftmsPowerEnabled = false;
    log(`FTMS ikke tilgængelig: ${error.message}`);
  }

  if (!hasPower) {
    throw new Error('KICKR blev fundet, men ingen understøttet watt-datakilde kunne åbnes.');
  }

  els.dataSource.textContent = `Datakilde: ${sources.join(' + ')}`;
  return sources;
}

async function connectToSelectedDevice() {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth findes ikke i denne browser. Brug Microsoft Edge eller Google Chrome.');
  }

  reconnectCancelled = false;
  setStatus('connecting', 'Søger efter KICKR', 'Vælg træneren i Bluetooth-vinduet');
  log('Åbner Bluetooth-vælgeren.');

  bluetoothDevice = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: 'KICKR' },
      { services: [UUID.cyclingPowerService] },
      { services: [UUID.fitnessMachineService] },
    ],
    optionalServices: [
      UUID.cyclingPowerService,
      UUID.cscService,
      UUID.fitnessMachineService,
    ],
  });

  addBluetoothDisconnectListener(bluetoothDevice, handleDisconnected);
  await connectGatt();
}

async function connectGatt() {
  if (!bluetoothDevice) throw new Error('Ingen Bluetooth-enhed er valgt.');

  setStatus('connecting', 'Forbinder', bluetoothDevice.name || 'Wahoo KICKR');
  const server = bluetoothDevice.gatt.connected
    ? bluetoothDevice.gatt
    : await bluetoothDevice.gatt.connect();

  const sources = await setupDataServices(server);
  setStatus('connected', 'Forbundet', bluetoothDevice.name || 'Wahoo KICKR');
  rememberBluetoothDevice('kickr', bluetoothDevice);
  log(`Forbundet. Datakilder: ${sources.join(', ')}.`);
  showToast('KICKR er forbundet');
  if (workoutState.running && ergState.enabled) syncErgToWorkout(true).catch(error => log(`ERG efter genforbindelse fejlede: ${error.message}`));
  await requestWakeLock();
}

async function handleDisconnected() {
  if (reconnectCancelled || !bluetoothDevice) return;
  prepareForTrainerReconnect();
  setStatus('connecting', 'Forbindelsen blev afbrudt', 'Forsøger automatisk igen');
  log('Bluetooth-forbindelsen blev afbrudt.');

  const delays = [1000, 2000, 4000, 8000];
  for (const delay of delays) {
    if (reconnectCancelled) return;
    await new Promise(resolve => setTimeout(resolve, delay));
    try {
      await connectGatt();
      return;
    } catch (error) {
      log(`Genforbindelse mislykkedes: ${error.message}`);
    }
  }

  setStatus('disconnected', 'Forbindelsen er væk', 'Tryk på Forbind til KICKR');
  showToast('Kunne ikke genoprette forbindelsen');
}

async function disconnect() {
  reconnectCancelled = true;
  await releaseErgControl('KICKR afbrydes').catch(error => log(`ERG stop-fejl: ${error.message}`));
  stopDemo();
  prepareForTrainerReconnect();

  for (const item of subscribedCharacteristics) {
    try {
      item.characteristic.removeEventListener('characteristicvaluechanged', item.handler);
      await item.characteristic.stopNotifications();
    } catch (_) {
      // Characteristic may already be invalid after a disconnect.
    }
  }
  subscribedCharacteristics = [];
  resetErgConnection();

  if (bluetoothDevice?.gatt?.connected) bluetoothDevice.gatt.disconnect();
  setStatus('disconnected', 'Ikke forbundet', 'Tryk på Forbind til KICKR');
  els.dataSource.textContent = 'Datakilde: --';
  log('Forbindelsen blev afbrudt manuelt.');
  await releaseWakeLock();
}

function handleHeartRateMeasurement(event) {
  const view = event.target.value;
  if (!view || view.byteLength < 2) return;
  const flags = view.getUint8(0);
  const heartRate = flags & 0x01 ? view.getUint16(1, true) : view.getUint8(1);
  updateHeartRate(heartRate);
}

async function connectHeartRate() {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth findes ikke i denne browser.');
  heartRateReconnectCancelled = false;
  setHeartRateStatus('connecting', 'Pulsmåler', 'Vælg enhed');
  heartRateDevice = await navigator.bluetooth.requestDevice({
    filters: [{ services: [UUID.heartRateService] }],
    optionalServices: [UUID.heartRateService],
  });
  addBluetoothDisconnectListener(heartRateDevice, handleHeartRateDisconnected);
  await connectHeartRateGatt();
}

async function connectHeartRateGatt() {
  if (!heartRateDevice) throw new Error('Ingen pulsmåler er valgt.');
  setHeartRateStatus('connecting', heartRateDevice.name || 'Pulsmåler', 'Forbinder');
  const server = heartRateDevice.gatt.connected ? heartRateDevice.gatt : await heartRateDevice.gatt.connect();
  const service = await server.getPrimaryService(UUID.heartRateService);
  heartRateCharacteristic = await service.getCharacteristic(UUID.heartRateMeasurement);
  heartRateCharacteristic.addEventListener('characteristicvaluechanged', handleHeartRateMeasurement);
  await heartRateCharacteristic.startNotifications();
  setHeartRateStatus('connected', heartRateDevice.name || 'Pulsmåler', 'Forbundet');
  rememberBluetoothDevice('heart_rate', heartRateDevice);
  log(`Pulsmåler forbundet: ${heartRateDevice.name || 'ukendt enhed'}.`);
  showToast('Pulsmåleren er forbundet');
}

async function handleHeartRateDisconnected() {
  if (heartRateReconnectCancelled || !heartRateDevice) return;
  setHeartRateStatus('connecting', heartRateDevice.name || 'Pulsmåler', 'Forsøger igen');
  for (const delay of [1000, 2000, 4000, 8000]) {
    if (heartRateReconnectCancelled) return;
    await new Promise(resolve => setTimeout(resolve, delay));
    try {
      await connectHeartRateGatt();
      return;
    } catch (error) {
      log(`Genforbindelse til puls mislykkedes: ${error.message}`);
    }
  }
  setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
  session.currentHeartRate = null;
  els.heartRateValue.textContent = '--';
  els.heartPulseIcon?.classList.remove('is-beating');
  setRing(els.heartRateRing, 0, 200);
  updateHeartRateChart(true, false);
}

async function disconnectHeartRate() {
  heartRateReconnectCancelled = true;
  try {
    heartRateCharacteristic?.removeEventListener('characteristicvaluechanged', handleHeartRateMeasurement);
    await heartRateCharacteristic?.stopNotifications();
  } catch (_) {
    // Enheden kan allerede være afbrudt.
  }
  if (heartRateDevice?.gatt?.connected) heartRateDevice.gatt.disconnect();
  heartRateCharacteristic = null;
  session.currentHeartRate = null;
  els.heartRateValue.textContent = '--';
  setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
  setRing(els.heartRateRing, 0, 200);
  updateHeartRateChart(true, false);
  log('Pulsmåleren blev afbrudt manuelt.');
}

async function reconnectTrainerFromRememberedDevice(device) {
  if (!device || hasActiveBluetoothDevice(bluetoothDevice)) return false;
  bluetoothDevice = device;
  reconnectCancelled = false;
  addBluetoothDisconnectListener(bluetoothDevice, handleDisconnected);
  prepareForTrainerReconnect();
  setStatus('connecting', bluetoothDevice.name || 'Wahoo KICKR', 'Forbinder automatisk');
  log(`Forsøger automatisk forbindelse til KICKR: ${bluetoothDevice.name || 'ukendt enhed'}.`);
  await connectGatt();
  return true;
}

async function reconnectHeartRateFromRememberedDevice(device) {
  if (!device || hasActiveBluetoothDevice(heartRateDevice)) return false;
  heartRateDevice = device;
  heartRateReconnectCancelled = false;
  addBluetoothDisconnectListener(heartRateDevice, handleHeartRateDisconnected);
  els.heartRateConnectButton.disabled = true;
  setHeartRateStatus('connecting', heartRateDevice.name || 'Pulsmåler', 'Forbinder automatisk');
  log(`Forsøger automatisk forbindelse til puls: ${heartRateDevice.name || 'ukendt enhed'}.`);
  try {
    await connectHeartRateGatt();
    return true;
  } finally {
    els.heartRateConnectButton.disabled = false;
  }
}

async function autoReconnectBluetoothDevices() {
  if (!navigator.bluetooth) return;

  if (typeof navigator.bluetooth.getDevices !== 'function') {
    log('Automatisk Bluetooth-genforbindelse understøttes ikke af denne browser.');
    return;
  }

  let devices = [];
  try {
    setStatus('connecting', 'Tjekker KICKR', 'Leder efter tidligere godkendt udstyr');
    setHeartRateStatus('connecting', 'Pulsmåler', 'Tjekker tidligere godkendelse');
    devices = await navigator.bluetooth.getDevices();
  } catch (error) {
    log(`Kunne ikke hente tidligere godkendt Bluetooth-udstyr: ${error.message}`);
    setStatus('disconnected', 'Ikke forbundet', 'Tryk på Forbind KICKR');
    setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
    return;
  }

  if (!devices.length) {
    log('Ingen tidligere godkendte Bluetooth-enheder fundet.');
    setStatus('disconnected', 'Ikke forbundet', 'Tryk på Forbind KICKR');
    setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
    return;
  }

  log(`Fandt ${devices.length} tidligere godkendt(e) Bluetooth-enhed(er).`);

  const rememberedKickr = findRememberedDevice(devices, 'kickr');
  const rememberedHeartRate = findRememberedDevice(devices, 'heart_rate');

  if (rememberedKickr) {
    try {
      await reconnectTrainerFromRememberedDevice(rememberedKickr);
    } catch (error) {
      log(`Automatisk KICKR-forbindelse mislykkedes: ${error.message}`);
      setStatus('disconnected', 'KICKR ikke forbundet', 'Tryk på Forbind KICKR');
    }
  } else {
    setStatus('disconnected', 'Ikke forbundet', 'Tryk på Forbind KICKR');
  }

  if (rememberedHeartRate && rememberedHeartRate.id !== rememberedKickr?.id) {
    try {
      await reconnectHeartRateFromRememberedDevice(rememberedHeartRate);
    } catch (error) {
      log(`Automatisk puls-forbindelse mislykkedes: ${error.message}`);
      setHeartRateStatus('disconnected', 'Pulsmåler', 'Tryk på Forbind puls');
    }
  } else {
    setHeartRateStatus('disconnected', 'Pulsmåler', 'Tryk på Forbind puls');
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => log('Skærmlås blev frigivet.'));
    log('Skærmen holdes vågen.');
  } catch (error) {
    log(`Kunne ikke holde skærmen vågen: ${error.message}`);
  }
}

async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch (_) { /* no-op */ }
  wakeLock = null;
}

function startDemo() {
  if (demoTimer) {
    stopDemo();
    return;
  }

  let phase = 0;
  resetSession(false);
  els.demoButton.textContent = 'Stop testvisning';
  els.dataSource.textContent = 'Datakilde: testdata';
  setHeartRateStatus('connected', 'Simuleret pulsmåler', 'Testdata');
  setStatus('connected', 'Testvisning', 'Simulerede tal – ikke KICKR-data');
  log('Testvisning startet.');

  demoTimer = setInterval(() => {
    phase += 0.16;
    const power = 185 + Math.sin(phase) * 55 + Math.sin(phase * 0.37) * 25;
    const cadence = 84 + Math.sin(phase * 0.72) * 8;
    const heartRate = 142 + Math.sin(phase * 0.3) * 11;
    updatePower(power);
    updateCadence(cadence);
    updateHeartRate(heartRate);
  }, 500);
}

function stopDemo() {
  if (!demoTimer) return;
  clearInterval(demoTimer);
  demoTimer = null;
  els.demoButton.textContent = 'Start testvisning';
  setStatus('disconnected', 'Ikke forbundet', 'Tryk på Forbind til KICKR');
  els.dataSource.textContent = 'Datakilde: --';
  if (heartRateDevice?.gatt?.connected) {
    setHeartRateStatus('connected', heartRateDevice.name || 'Pulsmåler', 'Forbundet');
  } else {
    setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
  }
  log('Testvisning stoppet.');
}


function setSettingsOpen(open) {
  if (!els.settingsPanel || !els.settingsBackdrop) return;
  const wasOpen = !els.settingsPanel.hidden;
  els.settingsPanel.hidden = !open;
  els.settingsBackdrop.hidden = !open;
  els.settingsButton?.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) els.settingsPanel.focus();
  else if (wasOpen) els.settingsButton?.focus();
}

function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

function updateInstallButton() {
  if (!els.installButton) return;
  els.installButton.hidden = isInstalledApp() || !deferredInstallPrompt;
}

async function installApp() {
  if (isInstalledApp()) {
    showToast('Appen er allerede installeret');
    return;
  }
  if (!deferredInstallPrompt) {
    showToast('Brug Edge-menuen og vælg Apps → Installér dette websted som app');
    return;
  }
  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch (_) {
    // ignore
  }
  deferredInstallPrompt = null;
  updateInstallButton();
}

function isAppBusy() {
  return Boolean(currentRide || workoutState.running || session.startedAt);
}

function setAppUpdateStatus(message, { buttonText = 'Søg efter opdatering', disabled = false } = {}) {
  if (els.appVersionText) els.appVersionText.textContent = `Bike Workout V${APP_VERSION}`;
  if (els.appUpdateStatus) els.appUpdateStatus.textContent = message;
  if (els.appUpdateButton) {
    els.appUpdateButton.textContent = buttonText;
    els.appUpdateButton.disabled = disabled;
  }
}

async function activateWaitingServiceWorker(force = false) {
  const worker = waitingServiceWorker || serviceWorkerRegistration?.waiting;
  if (!worker) return false;

  if (!force && isAppBusy()) {
    setAppUpdateStatus('Ny version er klar og installeres, når turen er afsluttet.', {
      buttonText: 'Installér opdatering nu',
    });
    return false;
  }

  reloadForServiceWorkerUpdate = true;
  setAppUpdateStatus('Installerer opdatering…', { buttonText: 'Installerer…', disabled: true });
  worker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

function handleWaitingServiceWorker(worker) {
  if (!worker) return;
  waitingServiceWorker = worker;
  if (isAppBusy()) {
    setAppUpdateStatus('Ny version er klar og venter, så turen ikke bliver afbrudt.', {
      buttonText: 'Installér opdatering nu',
    });
    showToast('En appopdatering er klar efter turen');
    return;
  }
  activateWaitingServiceWorker().catch(error => log(`Opdateringsaktivering fejlede: ${error.message}`));
}

async function checkForAppUpdate({ manual = false } = {}) {
  if (!serviceWorkerRegistration) {
    setAppUpdateStatus('Offline-funktionen er ikke tilgængelig i denne browser.', { disabled: true });
    return;
  }

  if (serviceWorkerRegistration.waiting) {
    handleWaitingServiceWorker(serviceWorkerRegistration.waiting);
    if (manual && isAppBusy()) showToast('Opdateringen venter for ikke at afbryde turen');
    return;
  }

  if (manual) setAppUpdateStatus('Søger efter opdatering…', { buttonText: 'Søger…', disabled: true });
  try {
    await serviceWorkerRegistration.update();
    if (serviceWorkerRegistration.waiting) {
      handleWaitingServiceWorker(serviceWorkerRegistration.waiting);
      return;
    }
    setAppUpdateStatus(`Version ${APP_VERSION} er opdateret.`, { buttonText: 'Søg efter opdatering' });
    if (manual) showToast('Du har allerede den nyeste version');
  } catch (error) {
    log(`Opdateringskontrol fejlede: ${error.message}`);
    setAppUpdateStatus('Kunne ikke kontrollere opdateringer. Prøv igen online.', { buttonText: 'Prøv igen' });
    if (manual) showToast('Opdateringskontrollen fejlede');
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    setAppUpdateStatus('Browseren understøtter ikke offline-installation.', { disabled: true });
    return;
  }

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    setAppUpdateStatus(`Version ${APP_VERSION} er klar til brug offline.`);

    if (serviceWorkerRegistration.waiting) handleWaitingServiceWorker(serviceWorkerRegistration.waiting);

    serviceWorkerRegistration.addEventListener('updatefound', () => {
      const installingWorker = serviceWorkerRegistration.installing;
      if (!installingWorker) return;
      setAppUpdateStatus('Henter ny appversion…', { buttonText: 'Henter…', disabled: true });
      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state !== 'installed') return;
        if (navigator.serviceWorker.controller) handleWaitingServiceWorker(installingWorker);
        else setAppUpdateStatus(`Version ${APP_VERSION} er installeret og virker offline.`);
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadForServiceWorkerUpdate) return;
      reloadForServiceWorkerUpdate = false;
      window.location.reload();
    });

    window.setTimeout(() => checkForAppUpdate(), 2500);
    window.clearInterval(appUpdateCheckTimer);
    appUpdateCheckTimer = window.setInterval(() => {
      if (waitingServiceWorker) activateWaitingServiceWorker().catch(() => {});
      else checkForAppUpdate();
    }, APP_UPDATE_CHECK_INTERVAL_MS);
  } catch (error) {
    log(`Service worker-fejl: ${error.message}`);
    setAppUpdateStatus('Offline-installation kunne ikke startes.', { buttonText: 'Prøv igen' });
  }
}

async function toggleFullscreen() {
  if (window.matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement) {
    showToast('Appen kører allerede i fuld skærm');
    return;
  }

  if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== 'function') {
    showToast('Browseren tillader ikke fuld skærm her');
    return;
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    log(`Fuldskærmsfejl: ${error.message}`);
    showToast('Fuld skærm blev afvist af browseren');
  }
}

els.connectButton.addEventListener('click', async () => {
  stopDemo();
  if (bluetoothDevice?.gatt?.connected) {
    await disconnect();
    return;
  }
  try {
    await connectToSelectedDevice();
  } catch (error) {
    setStatus('disconnected', 'Forbindelsen mislykkedes', error.message);
    log(`Fejl: ${error.message}`);
    showToast(error.message);
  }
});

els.resetButton.addEventListener('click', resetSession);
els.stopRideButton?.addEventListener('click', stopRide);
els.chooseRideFolderButton?.addEventListener('click', chooseRideFolder);
els.heartRateConnectButton?.addEventListener('click', async () => {
  stopDemo();
  if (heartRateDevice?.gatt?.connected) {
    await disconnectHeartRate();
    return;
  }
  try {
    await connectHeartRate();
  } catch (error) {
    setHeartRateStatus('disconnected', 'Pulsmåler', 'Ikke forbundet');
    log(`Pulsfejl: ${error.message}`);
    showToast(error.message);
  }
});
els.workoutImportButton?.addEventListener('click', () => els.workoutFileInput?.click());
els.workoutFileInput?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await importWorkoutFile(file);
  } catch (error) {
    log(`Workout-import fejlede: ${error.message}`);
    showToast(error.message);
    if (els.workoutImportStatus) els.workoutImportStatus.textContent = 'Import fejlede';
    if (els.workoutImportSummary) els.workoutImportSummary.textContent = error.message;
  } finally {
    event.target.value = '';
  }
});
els.ftpInput?.addEventListener('change', event => setWorkoutFtp(event.target.value));
els.workoutStartPauseButton?.addEventListener('click', () => { toggleWorkoutStartPause().catch(error => log(`Workout start/stop-fejl: ${error.message}`)); });
els.ergModeButton?.addEventListener('click', () => { toggleErgMode().catch(error => log(`ERG toggle-fejl: ${error.message}`)); });
els.workoutResetButton?.addEventListener('click', resetWorkout);
els.demoButton.addEventListener('click', startDemo);
els.fullscreenButton.addEventListener('click', toggleFullscreen);
els.installButton?.addEventListener('click', installApp);
els.appUpdateButton?.addEventListener('click', () => {
  if (waitingServiceWorker || serviceWorkerRegistration?.waiting) {
    activateWaitingServiceWorker(true).catch(error => log(`Manuel opdatering fejlede: ${error.message}`));
  } else {
    checkForAppUpdate({ manual: true });
  }
});
els.settingsButton?.addEventListener('click', () => setSettingsOpen(true));
els.closeSettingsButton?.addEventListener('click', () => setSettingsOpen(false));
els.settingsBackdrop?.addEventListener('click', () => setSettingsOpen(false));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setSettingsOpen(false);
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (bluetoothDevice?.gatt?.connected) await requestWakeLock();
  checkForAppUpdate().catch(() => {});
});

window.addEventListener('beforeunload', () => {
  reconnectCancelled = true;
  stopRideLogging();
  if (bluetoothDevice?.gatt?.connected) bluetoothDevice.gatt.disconnect();
  if (heartRateDevice?.gatt?.connected) heartRateDevice.gatt.disconnect();
});


window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallButton();
  showToast('Appen er installeret');
});

setInterval(updateElapsed, 500);
updateInstallButton();
setWorkoutFtp(workoutState.ftp);
updateWorkoutUi(true);
updateErgUi();
setRideActiveUi(false);
restoreRideDirectory();

window.addEventListener('load', registerServiceWorker);

const startupParams = new URLSearchParams(window.location.search);
const shouldStartDemo = startupParams.get('demo') === '1';

if (!navigator.bluetooth) {
  setStatus('disconnected', 'Web Bluetooth mangler', 'Åbn siden i Microsoft Edge eller Google Chrome');
  els.connectButton.disabled = true;
  els.heartRateConnectButton.disabled = true;
  log('Browseren understøtter ikke navigator.bluetooth.');
} else if (!shouldStartDemo) {
  window.setTimeout(() => {
    autoReconnectBluetoothDevices().catch(error => log(`Auto-genforbindelse stoppede: ${error.message}`));
  }, 500);
}

if (shouldStartDemo) {
  window.setTimeout(startDemo, 250);
}
