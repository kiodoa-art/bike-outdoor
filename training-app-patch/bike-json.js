function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function average(values) {
  const valid = values.map(finiteNumber).filter(value => value !== null);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

function maximum(values) {
  const valid = values.map(finiteNumber).filter(value => value !== null);
  return valid.length ? Math.max(...valid) : null;
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function firstNumber(...values) {
  return values.find(value => finiteNumber(value) !== null) ?? null;
}

function round(value, decimals = 0) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function calculateBikeRideSummary(ride = {}) {
  const supplied = ride.summary && typeof ride.summary === 'object' && !Array.isArray(ride.summary) ? ride.summary : {};
  const samples = Array.isArray(ride.samples) ? ride.samples.filter(sample => sample && typeof sample === 'object' && !Array.isArray(sample)) : [];
  const start = validIso(ride.startTime) || validIso(samples.find(sample => validIso(sample.timestamp))?.timestamp);
  const end = validIso(ride.endTime);
  const elapsedFromRide = start && end ? (Date.parse(end) - Date.parse(start)) / 1000 : null;
  const sampleTimes = samples.map(sample => finiteNumber(sample.t)).filter(value => value !== null);
  const elapsedFromT = sampleTimes.length ? Math.max(...sampleTimes) - Math.min(...sampleTimes) : null;
  const timestampValues = samples.map(sample => validIso(sample.timestamp)).filter(Boolean).map(Date.parse);
  const elapsedFromTimestamps = timestampValues.length ? (Math.max(...timestampValues) - Math.min(...timestampValues)) / 1000 : null;

  return {
    durationSec: firstNumber(supplied.durationSec, elapsedFromRide, elapsedFromT, elapsedFromTimestamps),
    distanceKm: firstNumber(supplied.distanceKm, maximum(samples.map(sample => sample.distanceKm))),
    avgPower: firstNumber(supplied.avgPower, average(samples.map(sample => sample.power))),
    maxPower: firstNumber(supplied.maxPower, maximum(samples.map(sample => sample.power))),
    normalizedPower: firstNumber(supplied.normalizedPower),
    avgHeartRate: firstNumber(supplied.avgHeartRate, average(samples.map(sample => sample.heartRate))),
    maxHeartRate: firstNumber(supplied.maxHeartRate, maximum(samples.map(sample => sample.heartRate))),
    avgCadence: firstNumber(supplied.avgCadence, average(samples.map(sample => sample.cadence))),
    maxCadence: firstNumber(supplied.maxCadence, maximum(samples.map(sample => sample.cadence)))
  };
}

export function bikeRideToActivity(ride, fileName = 'bike-ride.json') {
  if (!ride || typeof ride !== 'object' || Array.isArray(ride)) throw new Error('JSON-roden skal være et Bike ride-objekt.');
  if (ride.version !== undefined && ride.version !== 1) throw new Error('Bike-turens version understøttes ikke.');
  if (!('summary' in ride) && !('samples' in ride)) throw new Error('Filen ligner ikke en Bike-tur (summary eller samples mangler).');
  if ('samples' in ride && !Array.isArray(ride.samples)) throw new Error('Bike-turens samples skal være en liste.');
  const samples = Array.isArray(ride.samples) ? ride.samples : [];
  const startTime = validIso(ride.startTime) || validIso(samples.find(sample => validIso(sample?.timestamp))?.timestamp);
  if (!startTime) throw new Error('Bike-turen mangler en gyldig startTime.');
  const fallbackId = String(fileName).replace(/\.json$/i, '').trim();
  const id = String(ride.rideId ?? fallbackId).trim();
  if (!id) throw new Error('Bike-turen mangler både rideId og et brugbart filnavn.');
  const summary = calculateBikeRideSummary({ ...ride, startTime });
  const source = ride.source === 'garmin_fit' ? 'garmin_fit' : (typeof ride.source === 'string' && ride.source ? ride.source : 'bike_app');
  // Minimal, backwards-compatible change: honour ride.sport when the ride file provides one
  // (e.g. "outdoor_cycling" from the Bike Outdoor app), otherwise keep the existing default.
  // Old Bike/Garmin files never had a `sport` field, so they are unaffected.
  const sport = typeof ride.sport === 'string' && ride.sport ? ride.sport : 'indoor_cycling';
  return {
    id, date: startTime.slice(0, 10), startTime, sport,
    durationSeconds: round(summary.durationSec), averagePower: round(summary.avgPower),
    maxPower: round(summary.maxPower), normalizedPower: round(summary.normalizedPower),
    averageCadence: round(summary.avgCadence), averageHeartRate: round(summary.avgHeartRate),
    maxHeartRate: round(summary.maxHeartRate), distanceKm: round(summary.distanceKm, 2),
    calories: round(ride.summary?.calories), source,
    notes: `Importeret fra ${source === 'garmin_fit' ? 'Garmin-konverteret JSON' : 'Bike JSON'}: ${fileName}`
  };
}

export function sanitizeRideSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return samples.filter(sample => sample && typeof sample === 'object' && !Array.isArray(sample)).map((sample, index) => ({
    t: finiteNumber(sample.t) ?? index,
    timestamp: validIso(sample.timestamp),
    power: finiteNumber(sample.power),
    heartRate: finiteNumber(sample.heartRate),
    cadence: finiteNumber(sample.cadence),
    speedKmh: finiteNumber(sample.speedKmh),
    distanceKm: finiteNumber(sample.distanceKm)
  }));
}

export function bikeRideToBundle(ride, fileName = 'bike-ride.json') {
  const activity = bikeRideToActivity(ride, fileName);
  return { activity, samples: sanitizeRideSamples(ride.samples) };
}

export async function parseBikeRideJson(file) {
  if (!file || typeof file.text !== 'function') throw new Error('Bike JSON-filen kunne ikke læses.');
  let ride;
  try { ride = JSON.parse(await file.text()); }
  catch { throw new Error('Ugyldig JSON.'); }
  return bikeRideToActivity(ride, file.name || 'bike-ride.json');
}

export async function parseBikeRideBundle(file) {
  if (!file || typeof file.text !== 'function') throw new Error('Turfilen kunne ikke læses.');
  let ride;
  try { ride = JSON.parse(await file.text()); }
  catch { throw new Error('Ugyldig JSON.'); }
  return bikeRideToBundle(ride, file.name || 'bike-ride.json');
}
