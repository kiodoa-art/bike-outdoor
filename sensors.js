// sensors.js — Web Bluetooth: Cycling Power, Heart Rate and Cycling Speed/Cadence sensors.

const CYCLING_POWER_SERVICE = 'cycling_power';
const CYCLING_POWER_MEASUREMENT = 'cycling_power_measurement';
const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement';

// Cycling Speed and Cadence Service (0x1816) + CSC Measurement (0x2A5B).
// UUID'er bruges direkte, fordi de virker mere stabilt på tværs af browsere end navne-aliases.
const CSC_SERVICE = '00001816-0000-1000-8000-00805f9b34fb';
const CSC_MEASUREMENT = '00002a5b-0000-1000-8000-00805f9b34fb';

const DEFAULT_WHEEL_CIRCUMFERENCE_MM = 2105;

function bleSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

function deltaWithWrap(current, previous, wrap) {
  let delta = current - previous;
  if (delta < 0) delta += wrap;
  return delta;
}

function validSpeedKmh(value) {
  return Number.isFinite(value) && value >= 0 && value <= 130;
}

function validCadence(value) {
  return Number.isFinite(value) && value >= 0 && value <= 260;
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
  if (hasCrankRev && dataView.byteLength >= offset + 4) {
    const crankRevs = dataView.getUint16(offset, true); offset += 2;
    const crankEventTime = dataView.getUint16(offset, true); offset += 2; // 1/1024s
    if (prevCrank) {
      const revDelta = deltaWithWrap(crankRevs, prevCrank.revs, 65536);
      const timeDelta = deltaWithWrap(crankEventTime, prevCrank.time, 65536);
      if (timeDelta > 0) cadence = Math.round((revDelta * 1024 * 60) / timeDelta);
    }
    crankState = { revs: crankRevs, time: crankEventTime };
  }

  return { power, cadence, crankState };
}

// Parses CSC Measurement (0x2A5B).
// Wheel event time and crank event time are both in 1/1024 seconds.
function parseCscMeasurement(dataView, prevState, wheelCircumferenceMm) {
  const circumferenceMeters = Math.max(0.5, Math.min(3.2, (wheelCircumferenceMm || DEFAULT_WHEEL_CIRCUMFERENCE_MM) / 1000));
  const flags = dataView.getUint8(0);
  let offset = 1;
  const hasWheel = !!(flags & 0x01);
  const hasCrank = !!(flags & 0x02);

  const nextState = {
    wheel: prevState?.wheel || null,
    crank: prevState?.crank || null
  };
  const result = { cscState: nextState };

  if (hasWheel && dataView.byteLength >= offset + 6) {
    const wheelRevs = dataView.getUint32(offset, true); offset += 4;
    const wheelEventTime = dataView.getUint16(offset, true); offset += 2;
    const previous = prevState?.wheel;

    if (previous) {
      const revDelta = deltaWithWrap(wheelRevs, previous.revs, 4294967296);
      const timeDelta = deltaWithWrap(wheelEventTime, previous.time, 65536);
      const distanceDeltaMeters = revDelta * circumferenceMeters;

      if (timeDelta > 0) {
        const seconds = timeDelta / 1024;
        const speedKmh = (distanceDeltaMeters / seconds) * 3.6;
        if (validSpeedKmh(speedKmh)) result.speedKmh = speedKmh;
      }
      if (Number.isFinite(distanceDeltaMeters) && distanceDeltaMeters >= 0 && distanceDeltaMeters < 250) {
        result.distanceDeltaMeters = distanceDeltaMeters;
      }
    }

    nextState.wheel = { revs: wheelRevs, time: wheelEventTime };
  }

  if (hasCrank && dataView.byteLength >= offset + 4) {
    const crankRevs = dataView.getUint16(offset, true); offset += 2;
    const crankEventTime = dataView.getUint16(offset, true); offset += 2;
    const previous = prevState?.crank;

    if (previous) {
      const revDelta = deltaWithWrap(crankRevs, previous.revs, 65536);
      const timeDelta = deltaWithWrap(crankEventTime, previous.time, 65536);
      if (timeDelta > 0) {
        const cadence = Math.round((revDelta * 1024 * 60) / timeDelta);
        if (validCadence(cadence)) result.cadence = cadence;
      }
    }

    nextState.crank = { revs: crankRevs, time: crankEventTime };
  }

  return result;
}

function parseHeartRate(dataView) {
  const flags = dataView.getUint8(0);
  const is16bit = flags & 0x1;
  return is16bit ? dataView.getUint16(1, true) : dataView.getUint8(1);
}

export function createSensorManager({
  onPower,
  onCadence,
  onHeartRate,
  onCscSpeed,
  onCscCadence,
  onPowerStateChange,
  onHrStateChange,
  onSpeedStateChange,
  onCadenceStateChange
}) {
  let powerDevice = null;
  let hrDevice = null;
  let speedDevice = null;
  let cadenceDevice = null;
  let crankState = null;
  let speedCscState = null;
  let cadenceCscState = null;
  let wheelCircumferenceMm = DEFAULT_WHEEL_CIRCUMFERENCE_MM;

  function setWheelCircumferenceMm(mm) {
    const parsed = Number(mm);
    if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 3200) {
      wheelCircumferenceMm = parsed;
    }
  }

  async function connectPower() {
    if (!bleSupported()) { onPowerStateChange?.('unsupported'); return; }
    try {
      onPowerStateChange?.('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [CYCLING_POWER_SERVICE] }],
        optionalServices: [CYCLING_POWER_SERVICE]
      });
      powerDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        onPowerStateChange?.('disconnected');
        attemptReconnect(device, connectExistingPower);
      });
      await connectExistingPower(device);
    } catch (err) {
      onPowerStateChange?.('disconnected');
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
      if (Number.isFinite(power)) onPower?.(power);
      if (validCadence(cadence)) onCadence?.(cadence, 'power');
    });
    onPowerStateChange?.('connected');
  }

  async function connectHeartRate() {
    if (!bleSupported()) { onHrStateChange?.('unsupported'); return; }
    try {
      onHrStateChange?.('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [HEART_RATE_SERVICE]
      });
      hrDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        onHrStateChange?.('disconnected');
        attemptReconnect(device, connectExistingHr);
      });
      await connectExistingHr(device);
    } catch (err) {
      onHrStateChange?.('disconnected');
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
      if (Number.isFinite(hr)) onHeartRate?.(hr);
    });
    onHrStateChange?.('connected');
  }

  async function connectSpeedSensor() {
    if (!bleSupported()) { onSpeedStateChange?.('unsupported'); return; }
    try {
      onSpeedStateChange?.('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [CSC_SERVICE] }],
        optionalServices: [CSC_SERVICE]
      });
      speedDevice = device;
      speedCscState = null;
      device.addEventListener('gattserverdisconnected', () => {
        onSpeedStateChange?.('disconnected');
        attemptReconnect(device, connectExistingSpeedSensor);
      });
      await connectExistingSpeedSensor(device);
    } catch (err) {
      onSpeedStateChange?.('disconnected');
      throw err;
    }
  }

  async function connectExistingSpeedSensor(device) {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(CSC_SERVICE);
    const char = await service.getCharacteristic(CSC_MEASUREMENT);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (event) => {
      const parsed = parseCscMeasurement(event.target.value, speedCscState, wheelCircumferenceMm);
      speedCscState = parsed.cscState;
      if (validSpeedKmh(parsed.speedKmh) || Number.isFinite(parsed.distanceDeltaMeters)) {
        onCscSpeed?.({
          speedKmh: validSpeedKmh(parsed.speedKmh) ? parsed.speedKmh : null,
          distanceDeltaMeters: Number.isFinite(parsed.distanceDeltaMeters) ? parsed.distanceDeltaMeters : 0,
          source: 'csc_speed'
        });
      }
    });
    onSpeedStateChange?.('connected');
  }

  async function connectCadenceSensor() {
    if (!bleSupported()) { onCadenceStateChange?.('unsupported'); return; }
    try {
      onCadenceStateChange?.('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [CSC_SERVICE] }],
        optionalServices: [CSC_SERVICE]
      });
      cadenceDevice = device;
      cadenceCscState = null;
      device.addEventListener('gattserverdisconnected', () => {
        onCadenceStateChange?.('disconnected');
        attemptReconnect(device, connectExistingCadenceSensor);
      });
      await connectExistingCadenceSensor(device);
    } catch (err) {
      onCadenceStateChange?.('disconnected');
      throw err;
    }
  }

  async function connectExistingCadenceSensor(device) {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(CSC_SERVICE);
    const char = await service.getCharacteristic(CSC_MEASUREMENT);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (event) => {
      const parsed = parseCscMeasurement(event.target.value, cadenceCscState, wheelCircumferenceMm);
      cadenceCscState = parsed.cscState;
      if (validCadence(parsed.cadence)) onCscCadence?.(parsed.cadence, 'csc_cadence');
    });
    onCadenceStateChange?.('connected');
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
    connectSpeedSensor,
    connectCadenceSensor,
    setWheelCircumferenceMm,
    isBleSupported: bleSupported,
    disconnectAll() {
      try { powerDevice?.gatt?.disconnect(); } catch { /* ignore */ }
      try { hrDevice?.gatt?.disconnect(); } catch { /* ignore */ }
      try { speedDevice?.gatt?.disconnect(); } catch { /* ignore */ }
      try { cadenceDevice?.gatt?.disconnect(); } catch { /* ignore */ }
    }
  };
}
