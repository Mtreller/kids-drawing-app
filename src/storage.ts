import { drawObject, type Snapshot } from './drawing';
import { bitmapSource } from './history';

const DATABASE = 'color-pop-v2';
const DATABASE_VERSION = 2;
const ARTWORK_STORE = 'artwork';
const PROFILE_STORE = 'profiles';
const DRAWING_STORE = 'drawings';
const SETTINGS_STORE = 'settings';
const LEGACY_CURRENT_KEY = 'current';
const SETTINGS_KEY = 'app';

export type Profile = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  createdAt: number;
  updatedAt: number;
};

export type SavedDrawing = {
  id: string;
  profileId: string;
  title: string;
  snapshot: Snapshot;
  thumbnail: Blob;
  createdAt: number;
  updatedAt: number;
};

export type DrawingSummary = {
  id: string;
  profileId: string;
  title: string;
  thumbnail: Blob;
  createdAt: number;
  updatedAt: number;
};

export const PROFILE_AVATARS = [
  { emoji: '🦄', color: '#f3c4ff' },
  { emoji: '🐶', color: '#ffd6a5' },
  { emoji: '🌟', color: '#fff3a0' },
  { emoji: '🚀', color: '#bde0fe' },
  { emoji: '🐸', color: '#c8f5c0' },
  { emoji: '🦋', color: '#d0bfff' },
  { emoji: '🦖', color: '#b9fbc0' },
  { emoji: '🐯', color: '#ffc8a8' },
  { emoji: '🐙', color: '#ffadad' },
  { emoji: '🌈', color: '#caffbf' },
] as const;

export function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARTWORK_STORE)) database.createObjectStore(ARTWORK_STORE);
      if (!database.objectStoreNames.contains(PROFILE_STORE)) database.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(DRAWING_STORE)) {
        const drawings = database.createObjectStore(DRAWING_STORE, { keyPath: 'id' });
        drawings.createIndex('profileId', 'profileId', { unique: false });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) database.createObjectStore(SETTINGS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function withDatabase<T>(work: (database: IDBDatabase) => Promise<T>) {
  const database = await openDatabase();
  try {
    return await work(database);
  } finally {
    database.close();
  }
}

export async function listProfiles() {
  return withDatabase(async (database) => {
    const profiles = await requestToPromise(database.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).getAll()) as Profile[];
    return profiles.sort((left, right) => left.createdAt - right.createdAt);
  });
}

export async function saveProfile(profile: Profile) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(PROFILE_STORE, 'readwrite');
    transaction.objectStore(PROFILE_STORE).put(profile);
    await transactionDone(transaction);
  });
}

export async function deleteProfile(profileId: string) {
  return withDatabase(async (database) => {
    const transaction = database.transaction([PROFILE_STORE, DRAWING_STORE, SETTINGS_STORE], 'readwrite');
    const drawings = transaction.objectStore(DRAWING_STORE);
    const index = drawings.index('profileId');
    const matches = await requestToPromise(index.getAllKeys(profileId)) as IDBValidKey[];
    matches.forEach((key) => drawings.delete(key));
    transaction.objectStore(PROFILE_STORE).delete(profileId);
    const settingsRequest = transaction.objectStore(SETTINGS_STORE).get(SETTINGS_KEY);
    const settings = await requestToPromise(settingsRequest) as { activeProfileId?: string | null } | undefined;
    if (settings?.activeProfileId === profileId) {
      transaction.objectStore(SETTINGS_STORE).put({ activeProfileId: null }, SETTINGS_KEY);
    }
    await transactionDone(transaction);
  });
}

export async function getActiveProfileId() {
  return withDatabase(async (database) => {
    const settings = await requestToPromise(database.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE).get(SETTINGS_KEY)) as { activeProfileId?: string | null } | undefined;
    return settings?.activeProfileId ?? null;
  });
}

export async function setActiveProfileId(profileId: string | null) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
    transaction.objectStore(SETTINGS_STORE).put({ activeProfileId: profileId }, SETTINGS_KEY);
    await transactionDone(transaction);
  });
}

type StoredBlob = { mime: string; data: ArrayBuffer };

async function freezeBlob(value: string | Blob | undefined) {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return { mime: value.type || 'image/png', data: await value.arrayBuffer() } satisfies StoredBlob;
}

function thawBlob(value: unknown): string | Blob | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  if (typeof value === 'object' && value && 'data' in value) {
    const stored = value as StoredBlob;
    return new Blob([stored.data], { type: stored.mime || 'image/png' });
  }
  return undefined;
}

function thawSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    bitmap: thawBlob(snapshot.bitmap) ?? snapshot.bitmap,
    baseBitmap: thawBlob(snapshot.baseBitmap),
  };
}

function thawDrawing(record: SavedDrawing | undefined) {
  if (!record) return undefined;
  const thumbnail = thawBlob(record.thumbnail);
  return {
    ...record,
    thumbnail: thumbnail instanceof Blob ? thumbnail : new Blob(),
    snapshot: thawSnapshot(record.snapshot),
  } satisfies SavedDrawing;
}

function thawSummary(record: SavedDrawing): DrawingSummary {
  const thumbnail = thawBlob(record.thumbnail);
  return {
    id: record.id,
    profileId: record.profileId,
    title: record.title,
    thumbnail: thumbnail instanceof Blob ? thumbnail : new Blob(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listDrawingSummaries(profileId: string) {
  return withDatabase(async (database) => {
    const records = await requestToPromise(
      database.transaction(DRAWING_STORE, 'readonly').objectStore(DRAWING_STORE).index('profileId').getAll(IDBKeyRange.only(profileId)),
    ) as SavedDrawing[];
    return records.map(thawSummary).sort((left, right) => right.updatedAt - left.updatedAt);
  });
}

export async function getDrawing(id: string) {
  return withDatabase(async (database) => {
    const record = await requestToPromise(database.transaction(DRAWING_STORE, 'readonly').objectStore(DRAWING_STORE).get(id)) as SavedDrawing | undefined;
    return thawDrawing(record);
  });
}

export async function saveDrawing(drawing: SavedDrawing) {
  const stored = {
    ...drawing,
    thumbnail: await freezeBlob(drawing.thumbnail),
    snapshot: {
      ...drawing.snapshot,
      bitmap: await freezeBlob(drawing.snapshot.bitmap),
      baseBitmap: await freezeBlob(drawing.snapshot.baseBitmap),
    },
  };
  return withDatabase(async (database) => {
    const transaction = database.transaction(DRAWING_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(DRAWING_STORE).put(stored));
    await transactionDone(transaction);
  });
}

export async function deleteDrawing(id: string) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(DRAWING_STORE, 'readwrite');
    transaction.objectStore(DRAWING_STORE).delete(id);
    await transactionDone(transaction);
  });
}

async function loadLegacyArtwork() {
  return withDatabase(async (database) => {
    if (!database.objectStoreNames.contains(ARTWORK_STORE)) return undefined;
    const snapshot = await requestToPromise(database.transaction(ARTWORK_STORE, 'readonly').objectStore(ARTWORK_STORE).get(LEGACY_CURRENT_KEY)) as Snapshot | undefined;
    return snapshot?.bitmap ? thawSnapshot(snapshot) : undefined;
  });
}

export async function makeThumbnail(snapshot: Snapshot) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    const source = bitmapSource(snapshot.bitmap);
    element.onload = () => {
      source.release();
      resolve(element);
    };
    element.onerror = () => {
      source.release();
      reject(new Error('Thumbnail could not be created.'));
    };
    element.src = source.url;
  });
  const width = snapshot.width ?? image.naturalWidth;
  const height = snapshot.height ?? image.naturalHeight;
  const scale = Math.min(1, 360 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Thumbnail canvas is not ready.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(scale, scale);
  snapshot.objects.forEach((object) => drawObject(context, object));
  context.restore();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else canvas.toBlob((png) => {
        if (png) resolve(png);
        else reject(new Error('Thumbnail could not be compressed.'));
      }, 'image/png');
    }, 'image/jpeg', .72);
  });
}

export async function migrateLegacyArtwork() {
  const profiles = await listProfiles();
  if (profiles.length) return;
  const snapshot = await loadLegacyArtwork();
  if (!snapshot?.bitmap) return;
  const now = Date.now();
  const avatar = PROFILE_AVATARS[0];
  const profile: Profile = {
    id: makeId(),
    name: 'Artist',
    color: avatar.color,
    emoji: avatar.emoji,
    createdAt: now,
    updatedAt: now,
  };
  const drawing: SavedDrawing = {
    id: makeId(),
    profileId: profile.id,
    title: 'My drawing',
    snapshot,
    thumbnail: await makeThumbnail(snapshot),
    createdAt: now,
    updatedAt: now,
  };
  await saveProfile(profile);
  await saveDrawing(drawing);
  await setActiveProfileId(profile.id);
}
