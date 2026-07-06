const DB_NAME = 'bike-outdoor';
const DB_VERSION = 1;
const STORE = 'rides';
const ACTIVE_KEY = 'active';
const LAST_KEY = 'last';
let dbPromise;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(mode = 'readonly') {
  const db = await (dbPromise ||= openDatabase());
  return db?.transaction(STORE, mode).objectStore(STORE) || null;
}

async function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function write(key, value) {
  const objectStore = await store('readwrite');
  if (!objectStore) {
    localStorage.setItem(`bike-outdoor-${key}`, JSON.stringify(value));
    return;
  }
  await requestResult(objectStore.put(structuredClone(value), key));
}

async function read(key) {
  const objectStore = await store();
  if (!objectStore) {
    const raw = localStorage.getItem(`bike-outdoor-${key}`);
    return raw ? JSON.parse(raw) : null;
  }
  return requestResult(objectStore.get(key));
}

async function remove(key) {
  const objectStore = await store('readwrite');
  if (!objectStore) return localStorage.removeItem(`bike-outdoor-${key}`);
  await requestResult(objectStore.delete(key));
}

export const saveActiveRide = ride => write(ACTIVE_KEY, ride);
export const getActiveRide = () => read(ACTIVE_KEY);
export const clearActiveRide = () => remove(ACTIVE_KEY);
export const saveLastRide = ride => write(LAST_KEY, ride);
export const getLastRide = () => read(LAST_KEY);

export function loadSettings() {
  try { return { autoDim: true, autoPause: false, ...JSON.parse(localStorage.getItem('bike-outdoor-settings') || '{}') }; }
  catch { return { autoDim: true, autoPause: false }; }
}

export function saveSettings(settings) {
  localStorage.setItem('bike-outdoor-settings', JSON.stringify(settings));
}
