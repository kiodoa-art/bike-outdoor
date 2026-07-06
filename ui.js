// ui.js — tab switching, metric rendering, dim mode, wake lock, sparklines, toasts.

const $ = (id) => document.getElementById(id);

export function initTabs(onChange) {
  const switcher = document.querySelector('.tabswitch');
  const buttons = document.querySelectorAll('.tabswitch-btn');
  const views = { live: $('viewLive'), map: $('viewMap') };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      buttons.forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      switcher.dataset.active = tab;
      Object.entries(views).forEach(([key, el]) => el.classList.toggle('active', key === tab));
      $('subtitleLabel').textContent = tab === 'map' ? 'Rutekort' : 'Live Ride';
      onChange(tab);
    });
  });
}

export function setStatusChip(id, state, label) {
  const el = $(id);
  el.dataset.state = state;
  el.querySelector('.status-value').textContent = label;
}

function fmtTime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtNum(value, decimals = 0) {
  return Number.isFinite(value) ? value.toFixed(decimals) : '--';
}

export function renderLive(state) {
  const timeStr = fmtTime(state.elapsedSec);
  const distKm = state.distanceMeters / 1000;

  $('liveTime').textContent = timeStr;
  $('liveDistance').innerHTML = `${fmtNum(distKm, 1)} <small>km</small>`;
  $('livePower').textContent = Number.isFinite(state.currentPower) ? Math.round(state.currentPower) : '--';
  $('liveHr').textContent = Number.isFinite(state.currentHeartRate) ? Math.round(state.currentHeartRate) : '--';
  $('liveCadence').textContent = Number.isFinite(state.currentCadence) ? Math.round(state.currentCadence) : '--';
  $('liveSpeed').textContent = fmtNum(state.currentSpeedKmh, 1);

  $('avgPower').innerHTML = `${fmtNum(state.avgPower)} <small>W</small>`;
  $('maxPower').innerHTML = `${fmtNum(state.maxPower)} <small>W</small>`;
  $('elevation').innerHTML = `${fmtNum(state.elevationGainMeters)} <small>m</small>`;
  $('distanceSmall').innerHTML = `${fmtNum(distKm, 1)} <small>km</small>`;

  $('mapPower').innerHTML = `${Number.isFinite(state.currentPower) ? Math.round(state.currentPower) : '--'} <small>W</small>`;
  $('mapHr').innerHTML = `${Number.isFinite(state.currentHeartRate) ? Math.round(state.currentHeartRate) : '--'} <small>bpm</small>`;
  $('mapSpeedCard').innerHTML = `${fmtNum(state.currentSpeedKmh, 1)} <small>km/h</small>`;
  $('mapDistanceCard').innerHTML = `${fmtNum(distKm, 1)} <small>km</small>`;
  $('mapTime').textContent = timeStr;

  $('mapDistance').textContent = `${fmtNum(distKm, 1)} km`;
  $('mapSpeed').textContent = `${fmtNum(state.currentSpeedKmh, 1)} km/h`;
  $('mapAccuracy').textContent = Number.isFinite(state.gpsAccuracy) ? `GPS ±${Math.round(state.gpsAccuracy)}m` : 'GPS --';
}

const sparkBuffers = { Hr: [], Cadence: [], Speed: [] };
const SPARK_LEN = 30;

export function pushSpark(key, value) {
  const buf = sparkBuffers[key];
  if (!buf) return;
  buf.push(Number.isFinite(value) ? value : null);
  if (buf.length > SPARK_LEN) buf.shift();
  drawSpark(key);
}

function drawSpark(key) {
  const svg = $(`spark${key}`);
  if (!svg) return;
  const values = sparkBuffers[key].filter(v => v !== null);
  if (values.length < 2) { svg.innerHTML = ''; return; }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const buf = sparkBuffers[key];
  const step = 100 / (SPARK_LEN - 1);
  let d = '';
  buf.forEach((v, i) => {
    if (v === null) return;
    const x = i * step;
    const y = 26 - ((v - min) / range) * 24 - 1;
    d += (d ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
  });
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
}

// ============ Dim mode ============
let dimTimer = null;
let dimEnabled = true;

export function setDimEnabled(enabled) {
  dimEnabled = enabled;
  if (!enabled) { document.body.classList.remove('dim'); clearTimeout(dimTimer); }
  else resetDimTimer();
}

export function resetDimTimer() {
  document.body.classList.remove('dim');
  clearTimeout(dimTimer);
  if (!dimEnabled) return;
  dimTimer = setTimeout(() => document.body.classList.add('dim'), 12000);
}

export function initDimWatchers() {
  ['touchstart', 'pointerdown', 'click'].forEach(evt => document.addEventListener(evt, resetDimTimer, { passive: true }));
  resetDimTimer();
}

// ============ Wake lock ============
let wakeLock = null;

export async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

export async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wakeLock === null && document.body.dataset.rideActive === '1') {
    await requestWakeLock();
  }
});

// ============ Toast ============
let toastTimer = null;
export function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ============ Generic modal helpers ============
export function showModal(id) { $(id).hidden = false; }
export function hideModal(id) { $(id).hidden = true; }
