// sensors.js — Web Bluetooth Cycling Power (Stages) and Heart Rate sensors.

const CYCLING_POWER_SERVICE = 'cycling_power';
const CYCLING_POWER_MEASUREMENT = 'cycling_power_measurement';
const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement';

function bleSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

// Parses the Cycling Power Measurement characteristic (0x2A63).
// Returns { power, cadence } — cadence derived from crank revolution data if present.
function parseCyclingPower(dataView, prevCrank) {
  const flags = dataView.getUint16(0, true);
  let offset = 2;
  const power = dataView.getInt16(offset, true);
  offset += 2;

  const hasPedalPowerBalance = flags & 0x1;
  if (hasPedalPowerBalance) offset += 1;
  const hasAccumTorque = flags & 0x4;
  if (hasAccumTorque) offset += 2;
  const hasWheelRev = flags & 0x10;
  if (hasWheelRev) offset += 6;
  const hasCrankRev = flags & 0x20;

  let cadence = null;
  let crankState = prevCrank || null;
  if (hasCrankRev) {
    const crankRevs = dataView.getUint16(offset, true); offset += 2;
    const crankEventTime = dataView.getUint16(offset, true); offset += 2; // 1/1024s
    if (prevCrank) {
      let revDelta = crankRevs - prevCrank.revs;
      let timeDelta = crankEventTime - prevCrank.time;
      if (revDelta < 0) revDelta += 65536;
      if (timeDelta < 0) timeDelta += 65536;
      if (timeDelta > 0) cadence = Math.round((revDelta * 1024 * 60) / timeDelta);
    }
    crankState = { revs: crankRevs, time: crankEventTime };
  }

  return { power, cadence, crankState };
}

function parseHeartRate(dataView) {
  const flags = dataView.getUint8(0);
  const is16bit = flags & 0x1;
  return is16bit ? dataView.getUint16(1, true) : dataView.getUint8(1);
}

export function createSensorManager({ onPower, onCadence, onHeartRate, onPowerStateChange, onHrStateChange }) {
  let powerDevice = null;
  let hrDevice = null;
  let crankState = null;

  async function connectPower() {
    if (!bleSupported()) { onPowerStateChange('unsupported'); return; }
    try {
      onPowerStateChange('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [CYCLING_POWER_SERVICE] }],
        optionalServices: [CYCLING_POWER_SERVICE]
      });
      powerDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        onPowerStateChange('disconnected');
        attemptReconnect(device, connectExistingPower);
      });
      await connectExistingPower(device);
    } catch (err) {
      onPowerStateChange('disconnected');
      throw err;
    }
  }

  async function connectExistingPower(device) {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(CYCLING_POWER_SERVICE);
    const char = await service.getCharacteristic(CYCLING_POWER_MEASUREMENT);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (event) => {
      const { power, cadence, crankState: next } = parseCyclingPower(event.target.value, crankState);
      crankState = next;
      if (Number.isFinite(power)) onPower(power);
      if (Number.isFinite(cadence)) onCadence(cadence);
    });
    onPowerStateChange('connected');
  }

  async function connectHeartRate() {
    if (!bleSupported()) { onHrStateChange('unsupported'); return; }
    try {
      onHrStateChange('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [HEART_RATE_SERVICE]
      });
      hrDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        onHrStateChange('disconnected');
        attemptReconnect(device, connectExistingHr);
      });
      await connectExistingHr(device);
    } catch (err) {
      onHrStateChange('disconnected');
      throw err;
    }
  }

  async function connectExistingHr(device) {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(HEART_RATE_SERVICE);
    const char = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (event) => {
      const hr = parseHeartRate(event.target.value);
      if (Number.isFinite(hr)) onHeartRate(hr);
    });
    onHrStateChange('connected');
  }

  function attemptReconnect(device, reconnectFn, attempt = 1) {
    if (attempt > 5) return;
    setTimeout(async () => {
      try {
        if (device.gatt.connected) return;
        await reconnectFn(device);
      } catch {
        attemptReconnect(device, reconnectFn, attempt + 1);
      }
    }, Math.min(2000 * attempt, 10000));
  }

  return {
    connectPower,
    connectHeartRate,
    isBleSupported: bleSupported,
    disconnectAll() {
      try { powerDevice?.gatt?.disconnect(); } catch { /* ignore */ }
      try { hrDevice?.gatt?.disconnect(); } catch { /* ignore */ }
    }
  };
}
