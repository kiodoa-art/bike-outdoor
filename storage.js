// storage.js — IndexedDB active-ride autosave and crash recovery.
// Store: 'bikeOutdoor' DB, object store 'rides' with fixed keys:
//   'active'  -> the in-progress ride (overwritten continuously)
//   'lastRide' -> the most recently finished ride (kept for export from settings)

const DB_NAME = 'bike-outdoor';
const DB_VERSION = 1;
const STORE = 'rides';

let dbPromise = null;
const memoryFallback = new Map();

function openDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function idbPut(key, value) {
  const db = await openDb();
  if (!db) { memoryFallback.set(key, value); return; }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return memoryFallback.get(key) ?? null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  if (!db) { memoryFallback.delete(key); return; }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function saveActiveRide(rideState) {
  try { await idbPut('active', rideState); } catch { /* never break the ride on autosave failure */ }
}

export async function loadActiveRide() {
  try { return await idbGet('active'); } catch { return null; }
}

export async function clearActiveRide() {
  try { await idbDelete('active'); } catch { /* ignore */ }
}

export async function saveLastRide(rideJson) {
  try { await idbPut('lastRide', rideJson); } catch { /* ignore */ }
}

export async function loadLastRide() {
  try { return await idbGet('lastRide'); } catch { return null; }
}


export async function savePlannedRoute(route) {
  try { await idbPut('plannedRoute', route); } catch { /* ignore */ }
}

export async function loadPlannedRoute() {
  try { return await idbGet('plannedRoute'); } catch { return null; }
}

export async function clearPlannedRoute() {
  try { await idbDelete('plannedRoute'); } catch { /* ignore */ }
}
