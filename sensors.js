class BluetoothSensor extends EventTarget {
  constructor(type) { super(); this.type = type; this.device = null; this.value = null; this.reconnectTimer = null; }
  emit(status, message = '') { this.dispatchEvent(new CustomEvent('status', { detail: { type: this.type, status, message, deviceName: this.device?.name } })); }
  async reconnect() {
    clearTimeout(this.reconnectTimer);
    if (!this.device?.gatt) return;
    try { await this.connectGatt(); }
    catch { this.reconnectTimer = setTimeout(() => this.reconnect(), 5000); }
  }
  disconnect() { clearTimeout(this.reconnectTimer); this.device?.gatt?.disconnect(); this.value = null; this.emit('off'); }
}

export class PowerMeter extends BluetoothSensor {
  constructor() { super('power'); this.cadence = null; this.previousCrank = null; }
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth understøttes ikke i denne browser. Brug Chrome på Android.');
    this.emit('connecting');
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['cycling_power'] }], optionalServices: ['battery_service'] });
    this.device.addEventListener('gattserverdisconnected', () => { this.emit('off', 'Forbindelsen blev afbrudt'); this.reconnect(); });
    await this.connectGatt();
  }
  async connectGatt() {
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService('cycling_power');
    const characteristic = await service.getCharacteristic('cycling_power_measurement');
    characteristic.addEventListener('characteristicvaluechanged', event => this.onMeasurement(event.target.value));
    await characteristic.startNotifications();
    this.emit('on');
  }
  onMeasurement(data) {
    const flags = data.getUint16(0, true);
    this.value = data.getInt16(2, true);
    let offset = 4;
    if (flags & 1) offset += 1;
    if (flags & 4) offset += 2;
    if (flags & 16) offset += 6;
    if ((flags & 32) && data.byteLength >= offset + 4) {
      const revolutions = data.getUint16(offset, true);
      const eventTime = data.getUint16(offset + 2, true);
      if (this.previousCrank) {
        const revDelta = (revolutions - this.previousCrank.revolutions + 65536) % 65536;
        const timeDelta = (eventTime - this.previousCrank.eventTime + 65536) % 65536;
        if (timeDelta > 0 && revDelta < 20) this.cadence = Math.round(revDelta * 60 * 1024 / timeDelta);
      }
      this.previousCrank = { revolutions, eventTime };
    }
    this.dispatchEvent(new CustomEvent('data', { detail: { power: this.value, cadence: this.cadence } }));
  }
}

export class HeartRateMonitor extends BluetoothSensor {
  constructor() { super('hr'); }
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth understøttes ikke i denne browser. Brug Chrome på Android.');
    this.emit('connecting');
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    this.device.addEventListener('gattserverdisconnected', () => { this.emit('off', 'Forbindelsen blev afbrudt'); this.reconnect(); });
    await this.connectGatt();
  }
  async connectGatt() {
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    characteristic.addEventListener('characteristicvaluechanged', event => this.onMeasurement(event.target.value));
    await characteristic.startNotifications();
    this.emit('on');
  }
  onMeasurement(data) {
    this.value = data.getUint8(0) & 1 ? data.getUint16(1, true) : data.getUint8(1);
    this.dispatchEvent(new CustomEvent('data', { detail: { heartRate: this.value } }));
  }
}
