import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRadarMeasurement } from '../sensors.js';

function view(bytes) {
  const array = Uint8Array.from(bytes);
  return new DataView(array.buffer);
}

test('decodes multiple legacy radar vehicle triplets and sorts nearest first', () => {
  const result = parseRadarMeasurement(view([7, 11, 120, 55, 12, 42, 91]));
  assert.deepEqual(result, [
    { id: 12, distanceMeters: 42, approachSpeedKmh: 91 },
    { id: 11, distanceMeters: 120, approachSpeedKmh: 55 }
  ]);
});

test('ignores incomplete startup packet', () => {
  assert.deepEqual(parseRadarMeasurement(view([1, 9, 80])), []);
});

test('returns empty list for heartbeat/header-only packet', () => {
  assert.deepEqual(parseRadarMeasurement(view([2])), []);
});
