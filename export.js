const number = value => Number.isFinite(value) ? value : null;
const rounded = (value, digits = 0) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const average = values => {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};
const maximum = values => {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
};

export function buildRideJson(ride, endTime = new Date().toISOString()) {
  const samples = Array.isArray(ride.samples) ? ride.samples : [];
  const active = samples.filter(sample => !sample.isPaused);
  const durationSec = Math.max(0, Math.round(ride.elapsedSec ?? ((Date.parse(endTime) - Date.parse(ride.startTime)) / 1000)));
  const movingTimeSec = Math.max(0, Math.round(ride.movingTimeSec || 0));
  const distanceMeters = rounded(ride.distanceMeters || 0, 1);
  const elevationGainMeters = rounded(ride.elevationGainMeters || 0, 1);
  return {
    version: 1,
    source: 'bike_outdoor',
    rideId: ride.rideId,
    startTime: ride.startTime,
    endTime,
    durationSec,
    movingTimeSec,
    distanceMeters,
    elevationGainMeters,
    summary: {
      durationSec,
      movingTimeSec,
      distanceKm: rounded(distanceMeters / 1000, 3),
      distanceMeters,
      elevationGainMeters,
      avgPower: rounded(average(active.map(s => s.power))),
      maxPower: rounded(maximum(active.map(s => s.power))),
      avgHeartRate: rounded(average(active.map(s => s.heartRate))),
      maxHeartRate: rounded(maximum(active.map(s => s.heartRate))),
      avgCadence: rounded(average(active.map(s => s.cadence))),
      maxCadence: rounded(maximum(active.map(s => s.cadence))),
      avgSpeedKmh: rounded(movingTimeSec > 0 ? distanceMeters / movingTimeSec * 3.6 : average(active.map(s => s.speedKmh)), 1),
      maxSpeedKmh: rounded(maximum(active.map(s => s.speedKmh)), 1)
    },
    laps: Array.isArray(ride.laps) ? ride.laps : [],
    samples: samples.map((sample, index) => ({
      timestamp: sample.timestamp,
      t: number(sample.elapsedSec) ?? index,
      elapsedSec: number(sample.elapsedSec) ?? index,
      power: number(sample.power),
      heartRate: number(sample.heartRate),
      cadence: number(sample.cadence),
      speedKmh: number(sample.speedKmh),
      distanceKm: rounded((sample.distanceMeters || 0) / 1000, 5),
      distanceMeters: rounded(sample.distanceMeters || 0, 1),
      lat: number(sample.lat), lon: number(sample.lon), altitude: number(sample.altitude),
      gpsAccuracy: number(sample.gpsAccuracy), heading: number(sample.heading),
      isPaused: Boolean(sample.isPaused)
    }))
  };
}

export function rideFilename(ride) {
  const date = new Date(ride.startTime);
  const pad = value => String(value).padStart(2, '0');
  return `ride-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}-outdoor.json`;
}

export function downloadRide(ride) {
  const json = ride.version === 1 && ride.source === 'bike_outdoor' ? ride : buildRideJson(ride, ride.endTime);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = rideFilename(json); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
