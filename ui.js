const $ = selector => document.querySelector(selector);
const setText = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
const metric = value => Number.isFinite(value) ? Math.round(value) : '--';
const oneDecimal = value => Number.isFinite(value) ? value.toFixed(1) : '0.0';

export function formatTime(seconds = 0) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 3600)}:${String(Math.floor(safe / 60) % 60).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function renderMetrics(state) {
  const distanceKm = (state.distanceMeters || 0) / 1000;
  const time = formatTime(state.elapsedSec);
  setText('#elapsed', time);
  setText('#mapTime', time);
  ['#topDistance','#smallDistance','#mapDistance','#mapDistanceCard'].forEach(id => setText(id, oneDecimal(distanceKm)));

  setText('#heroPower', metric(state.power));
  $('#heroPower')?.classList.toggle('empty', !Number.isFinite(state.power));
  setText('#mapPower', metric(state.power));
  setText('#heartRate', metric(state.heartRate));
  setText('#mapHr', metric(state.heartRate));
  setText('#cadence', metric(state.cadence));
  setText('#speed', oneDecimal(state.speedKmh));
  setText('#mapSpeed', oneDecimal(state.speedKmh));
  setText('#avgPower', metric(state.avgPower));
  setText('#maxPower', metric(state.maxPower));
  setText('#elevation', Math.round(state.elevationGainMeters || 0));
  setText('#accuracy', Number.isFinite(state.gpsAccuracy) ? `±${Math.round(state.gpsAccuracy)} m` : 'GPS accuracy --');

  renderSpark('#hrSpark', state.histories?.heartRate || []);
  renderSpark('#mapHrSpark', state.histories?.heartRate || []);
  renderSpark('#cadenceSpark', state.histories?.cadence || []);
  renderSpark('#speedSpark', state.histories?.speed || []);
  renderSpark('#mapSpeedSpark', state.histories?.speed || []);
  renderSpark('#mapPowerSpark', state.histories?.power || []);
}

function renderSpark(selector, values) {
  const node = $(selector);
  const valid = (values || []).filter(Number.isFinite).slice(-30);
  if (!node) return;
  if (valid.length < 2) {
    node.setAttribute('points', '0,25 120,25');
    return;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const spread = max - min || 1;
  node.setAttribute('points', valid.map((value, index) => `${index / (valid.length - 1) * 120},${25 - (value - min) / spread * 21}`).join(' '));
}

export function setConnection(type, status, detail = '') {
  const id = type === 'power' ? '#powerStatus' : type === 'hr' ? '#hrStatus' : '#gpsStatus';
  const node = $(id);
  if (!node) return;
  node.dataset.state = status === 'on' ? 'on' : status === 'error' ? 'error' : 'off';
  const text = status === 'on'
    ? (type === 'gps' ? 'LOCK' : 'CONNECTED')
    : status === 'connecting' || status === 'searching'
      ? 'SEARCHING'
      : status === 'error'
        ? 'ERROR'
        : 'OFF';
  node.querySelector('small').textContent = text;

  const setting = type === 'power' ? '#powerSettingText' : type === 'hr' ? '#hrSettingText' : '#gpsSettingText';
  if (type === 'gps') setText(setting, status === 'on' ? detail || 'Position låst' : detail || 'Finder position…');
  else setText(setting, status === 'on' ? detail || 'Forbundet' : detail || (type === 'power' ? 'Forbind Stages / Cycling Power' : 'Forbind Bluetooth-pulsbånd'));
}

export function setRideState(state) {
  const active = state === 'recording' || state === 'paused';
  $('#rideControls')?.classList.toggle('active', active);
  if ($('#startButton')) $('#startButton').hidden = active;
  document.querySelectorAll('.during').forEach(button => { button.hidden = !active; });
  if ($('#pauseButton')) $('#pauseButton').innerHTML = state === 'paused' ? '<span>▶</span> RESUME' : '<span>Ⅱ</span> PAUSE';
  setText('#rideSubtitle', state === 'recording' ? 'Live Ride' : state === 'paused' ? 'Ride Paused' : state === 'stopped' ? 'Ride Saved' : 'Live Ride');
}

export function setupTabs(onChange) {
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.body.dataset.tab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(item => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    $(`#${tab.dataset.tab}View`)?.classList.add('active');
    onChange?.(tab.dataset.tab);
  }));
}

export function setupSettings() {
  const panel = $('#settings'), scrim = $('#scrim');
  const open = () => { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); scrim.hidden = false; };
  const close = () => { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); scrim.hidden = true; };
  $('#menuButton')?.addEventListener('click', open);
  $('#moreButton')?.addEventListener('click', open);
  $('#closeSettings')?.addEventListener('click', close);
  scrim?.addEventListener('click', close);
  return { open, close };
}

export function showInfo(title, text) {
  setText('#infoTitle', title);
  setText('#infoText', text);
  $('#infoDialog')?.showModal();
}

export function setupDimMode(enabled) {
  let timer;
  const wake = () => {
    $('#appShell')?.classList.remove('dimmed');
    clearTimeout(timer);
    if (enabled()) timer = setTimeout(() => $('#appShell')?.classList.add('dimmed'), 12000);
  };
  ['pointerdown','touchstart','keydown'].forEach(event => document.addEventListener(event, wake, { passive: true }));
  wake();
  return wake;
}
