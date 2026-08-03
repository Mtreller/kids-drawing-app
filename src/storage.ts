import type { Snapshot } from './drawing';

const DATABASE = 'color-pop-v2';
const STORE = 'artwork';
const CURRENT_KEY = 'current';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCurrentArtwork(snapshot: Snapshot) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(snapshot, CURRENT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadCurrentArtwork() {
  const database = await openDatabase();
  const result = await new Promise<Snapshot | undefined>((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(CURRENT_KEY);
    request.onsuccess = () => resolve(request.result as Snapshot | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}
