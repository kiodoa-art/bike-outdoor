import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRideJson } from '../export.js';

test('exports radar summary and per-sample vehicle data', () => {
  const result = buildRideJson({
    rideId: 'ride-test-outdoor',
    startTime: '2026-07-13T10:00:00.000Z',
    endTime: '2026-07-13T10:00:01.000Z',
    elapsedSec: 1,
    movingTimeSec: 1,
    distanceMeters: 8,
    elevationGainMeters: 0,
    distanceSource: 'gps',
    wheelCircumferenceMm: 2105,
    plannedRoute: null,
    radarConnected: true,
    radarBattery: 73,
    radarPassCount: 2,
    laps: [],
    samples: [{
      t: 1,
      timestamp: '2026-07-13T10:00:01.000Z',
      power: 180,
      heartRate: 130,
      cadence: 88,
      speedKmh: 28,
      distanceMeters: 8,
      radarConnected: true,
      radarBattery: 73,
      radarNearestDistanceMeters: 42,
      radarApproachSpeedKmh: 91,
      radarVehicles: [{ id: 12, distanceMeters: 42, approachSpeedKmh: 91 }]
    }]
  });

  assert.equal(result.summary.radarVehiclePasses, 2);
  assert.equal(result.radar.batteryAtEnd, 73);
  assert.deepEqual(result.samples[0].radarVehicles, [
    { id: 12, distanceMeters: 42, approachSpeedKmh: 91 }
  ]);
});
