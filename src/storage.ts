import { drawObject, type Snapshot } from './drawing';
import { bitmapSource } from './history';
import {
  deleteRemoteDrawing,
  deleteRemoteProfile,
  drawingFromWire,
  drawingToWire,
  fetchHouse,
  putDrawing,
  putProfile,
  setCloudStatus,
} from './cloud';
import { getHouseCode, houseCodeFromLocation, initHouseCode, readStoredHouseCode, setHouseCode } from './house';

const DATABASE = 'color-pop-v2';
const DATABASE_VERSION = 2;
const ARTWORK_STORE = 'artwork';
const PROFILE_STORE = 'profiles';
const DRAWING_STORE = 'drawings';
const SETTINGS_STORE = 'settings';
const LEGACY_CURRENT_KEY = 'current';
const SETTINGS_KEY = 'app';
const MEMORY_SESSION_KEY = 'color-pop-memory-v1';
const OPEN_DATABASE_TIMEOUT = 2500;
const CLOUD_DRAWING_DELAY = 1600;

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

export type StorageKind = 'device' | 'memory';

type StoredBlob = { mime: string; data: ArrayBuffer };
type StoredSnapshot = Omit<Snapshot, 'bitmap' | 'baseBitmap'> & {
  bitmap: string | Blob | StoredBlob;
  baseBitmap?: string | Blob | StoredBlob;
};
type StoredDrawing = Omit<SavedDrawing, 'thumbnail' | 'snapshot'> & {
  thumbnail: StoredBlob | Blob;
  snapshot: StoredSnapshot;
};

type SyncOptions = { sync?: boolean };

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

let backend: StorageKind | 'unknown' = 'unknown';
const memory = {
  profiles: new Map<string, Profile>(),
  drawings: new Map<string, StoredDrawing>(),
  settings: { activeProfileId: null as string | null },
};
const pendingCloudDrawings = new Map<string, SavedDrawing>();
const cloudDrawingTimers = new Map<string, number>();
let sessionMirrorQueue = Promise.resolve();

export function getStorageKind(): StorageKind {
  return backend === 'memory' ? 'memory' : 'device';
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('IndexedDB timed out.')), OPEN_DATABASE_TIMEOUT);
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
    request.onsuccess = () => {
      window.clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      window.clearTimeout(timer);
      reject(request.error);
    };
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

async function restoreMemoryFromSession() {
  try {
    const raw = sessionStorage.getItem(MEMORY_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      profiles?: Profile[];
      drawings?: Parameters<typeof drawingFromWire>[0][];
      activeProfileId?: string | null;
    };
    parsed.profiles?.forEach((profile) => memory.profiles.set(profile.id, profile));
    for (const drawing of parsed.drawings ?? []) {
      const thawed = drawingFromWire(drawing);
      memory.drawings.set(thawed.id, await freezeDrawing(thawed));
    }
    if (parsed.activeProfileId !== undefined) memory.settings.activeProfileId = parsed.activeProfileId;
  } catch {
    /* Session backup is best-effort in private windows. */
  }
}

function mirrorMemoryToSession() {
  if (backend !== 'memory') return;
  sessionMirrorQueue = sessionMirrorQueue.then(async () => {
    const drawings = [];
    for (const stored of memory.drawings.values()) {
      drawings.push(await drawingToWire(thawDrawing(stored)!));
    }
    sessionStorage.setItem(MEMORY_SESSION_KEY, JSON.stringify({
      profiles: [...memory.profiles.values()],
      drawings,
      activeProfileId: memory.settings.activeProfileId,
    }));
  }).catch(() => undefined);
}

async function ensureBackend(): Promise<StorageKind> {
  if (backend === 'device' || backend === 'memory') return backend;
  try {
    await withDatabase(async () => undefined);
    backend = 'device';
  } catch {
    backend = 'memory';
    await restoreMemoryFromSession();
  }
  return backend;
}

async function withStore<T>(
  idbWork: (database: IDBDatabase) => Promise<T>,
  memoryWork: () => Promise<T> | T,
) {
  const kind = await ensureBackend();
  if (kind === 'memory') return memoryWork();
  try {
    return await withDatabase(idbWork);
  } catch {
    backend = 'memory';
    await restoreMemoryFromSession();
    return memoryWork();
  }
}

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

function thawSnapshot(snapshot: StoredSnapshot | Snapshot): Snapshot {
  const bitmap = thawBlob(snapshot.bitmap);
  if (bitmap == null) throw new Error('Drawing is missing its picture data.');
  return {
    ...snapshot,
    bitmap,
    baseBitmap: thawBlob(snapshot.baseBitmap),
  };
}

function thawDrawing(record: StoredDrawing | SavedDrawing | undefined) {
  if (!record) return undefined;
  const thumbnail = thawBlob(record.thumbnail);
  return {
    ...record,
    thumbnail: thumbnail instanceof Blob ? thumbnail : new Blob(),
    snapshot: thawSnapshot(record.snapshot),
  } satisfies SavedDrawing;
}

function thawSummary(record: StoredDrawing | SavedDrawing): DrawingSummary {
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

async function freezeDrawing(drawing: SavedDrawing): Promise<StoredDrawing> {
  const bitmap = await freezeBlob(drawing.snapshot.bitmap);
  if (bitmap == null) throw new Error('Drawing is missing its picture data.');
  return {
    ...drawing,
    thumbnail: await freezeBlob(drawing.thumbnail) as StoredBlob,
    snapshot: {
      ...drawing.snapshot,
      bitmap,
      baseBitmap: await freezeBlob(drawing.snapshot.baseBitmap),
    },
  };
}

function queueCloudDrawing(drawing: SavedDrawing) {
  pendingCloudDrawings.set(drawing.id, drawing);
  const previous = cloudDrawingTimers.get(drawing.id);
  if (previous) window.clearTimeout(previous);
  cloudDrawingTimers.set(drawing.id, window.setTimeout(() => {
    cloudDrawingTimers.delete(drawing.id);
    const latest = pendingCloudDrawings.get(drawing.id);
    if (!latest) return;
    pendingCloudDrawings.delete(drawing.id);
    void drawingToWire(latest).then((wire) => putDrawing(wire)).catch(() => undefined);
  }, CLOUD_DRAWING_DELAY));
}

function queueCloudProfile(profile: Profile) {
  void putProfile(profile).catch(() => undefined);
}

export async function flushCloudSaves() {
  for (const timer of cloudDrawingTimers.values()) window.clearTimeout(timer);
  cloudDrawingTimers.clear();
  const pending = [...pendingCloudDrawings.values()];
  pendingCloudDrawings.clear();
  await Promise.all(pending.map(async (drawing) => {
    try { await putDrawing(await drawingToWire(drawing)); }
    catch { /* Keep the local copy if the family cloud is unreachable. */ }
  }));
}

export async function listProfiles() {
  return withStore(async (database) => {
    const profiles = await requestToPromise(database.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).getAll()) as Profile[];
    return profiles.sort((left, right) => left.createdAt - right.createdAt);
  }, () => [...memory.profiles.values()].sort((left, right) => left.createdAt - right.createdAt));
}

export async function getProfile(profileId: string) {
  return withStore(async (database) => {
    return await requestToPromise(database.transaction(PROFILE_STORE, 'readonly').objectStore(PROFILE_STORE).get(profileId)) as Profile | undefined;
  }, () => memory.profiles.get(profileId));
}

export async function saveProfile(profile: Profile, options: SyncOptions = {}) {
  await withStore(async (database) => {
    const transaction = database.transaction(PROFILE_STORE, 'readwrite');
    transaction.objectStore(PROFILE_STORE).put(profile);
    await transactionDone(transaction);
  }, () => {
    memory.profiles.set(profile.id, profile);
    mirrorMemoryToSession();
  });
  if (options.sync !== false) queueCloudProfile(profile);
}

export async function deleteProfile(profileId: string, options: SyncOptions = {}) {
  await withStore(async (database) => {
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
  }, () => {
    memory.profiles.delete(profileId);
    for (const [id, drawing] of memory.drawings) {
      if (drawing.profileId === profileId) memory.drawings.delete(id);
    }
    if (memory.settings.activeProfileId === profileId) memory.settings.activeProfileId = null;
    mirrorMemoryToSession();
  });
  if (options.sync !== false) void deleteRemoteProfile(profileId).catch(() => undefined);
}

export async function getActiveProfileId() {
  return withStore(async (database) => {
    const settings = await requestToPromise(database.transaction(SETTINGS_STORE, 'readonly').objectStore(SETTINGS_STORE).get(SETTINGS_KEY)) as { activeProfileId?: string | null } | undefined;
    return settings?.activeProfileId ?? null;
  }, () => memory.settings.activeProfileId);
}

export async function setActiveProfileId(profileId: string | null) {
  return withStore(async (database) => {
    const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
    transaction.objectStore(SETTINGS_STORE).put({ activeProfileId: profileId }, SETTINGS_KEY);
    await transactionDone(transaction);
  }, () => {
    memory.settings.activeProfileId = profileId;
    mirrorMemoryToSession();
  });
}

export async function listDrawingSummaries(profileId: string) {
  return withStore(async (database) => {
    const records = await requestToPromise(
      database.transaction(DRAWING_STORE, 'readonly').objectStore(DRAWING_STORE).index('profileId').getAll(IDBKeyRange.only(profileId)),
    ) as SavedDrawing[];
    return records.map(thawSummary).sort((left, right) => right.updatedAt - left.updatedAt);
  }, () => [...memory.drawings.values()]
    .filter((drawing) => drawing.profileId === profileId)
    .map(thawSummary)
    .sort((left, right) => right.updatedAt - left.updatedAt));
}

export async function listAllDrawings() {
  return withStore(async (database) => {
    const records = await requestToPromise(database.transaction(DRAWING_STORE, 'readonly').objectStore(DRAWING_STORE).getAll()) as SavedDrawing[];
    return records.map((record) => thawDrawing(record)!);
  }, () => [...memory.drawings.values()].map((record) => thawDrawing(record)!));
}

export async function getDrawing(id: string) {
  return withStore(async (database) => {
    const record = await requestToPromise(database.transaction(DRAWING_STORE, 'readonly').objectStore(DRAWING_STORE).get(id)) as SavedDrawing | undefined;
    return thawDrawing(record);
  }, () => thawDrawing(memory.drawings.get(id)));
}

export async function saveDrawing(drawing: SavedDrawing, options: SyncOptions = {}) {
  const stored = await freezeDrawing(drawing);
  await withStore(async (database) => {
    const transaction = database.transaction(DRAWING_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(DRAWING_STORE).put(stored));
    await transactionDone(transaction);
  }, () => {
    memory.drawings.set(drawing.id, stored);
    mirrorMemoryToSession();
  });
  if (options.sync !== false) queueCloudDrawing(thawDrawing(stored)!);
}

export async function deleteDrawing(id: string, options: SyncOptions = {}) {
  await withStore(async (database) => {
    const transaction = database.transaction(DRAWING_STORE, 'readwrite');
    transaction.objectStore(DRAWING_STORE).delete(id);
    await transactionDone(transaction);
  }, () => {
    memory.drawings.delete(id);
    pendingCloudDrawings.delete(id);
    mirrorMemoryToSession();
  });
  if (options.sync !== false) void deleteRemoteDrawing(id).catch(() => undefined);
}

async function clearAllLocalData() {
  pendingCloudDrawings.clear();
  for (const timer of cloudDrawingTimers.values()) window.clearTimeout(timer);
  cloudDrawingTimers.clear();
  await withStore(async (database) => {
    const transaction = database.transaction([PROFILE_STORE, DRAWING_STORE, SETTINGS_STORE], 'readwrite');
    transaction.objectStore(PROFILE_STORE).clear();
    transaction.objectStore(DRAWING_STORE).clear();
    transaction.objectStore(SETTINGS_STORE).put({ activeProfileId: null }, SETTINGS_KEY);
    await transactionDone(transaction);
  }, () => {
    memory.profiles.clear();
    memory.drawings.clear();
    memory.settings.activeProfileId = null;
    try { sessionStorage.removeItem(MEMORY_SESSION_KEY); }
    catch { /* Ignore */ }
  });
}

async function loadLegacyArtwork() {
  return withStore(async (database) => {
    if (!database.objectStoreNames.contains(ARTWORK_STORE)) return undefined;
    const snapshot = await requestToPromise(database.transaction(ARTWORK_STORE, 'readonly').objectStore(ARTWORK_STORE).get(LEGACY_CURRENT_KEY)) as Snapshot | undefined;
    return snapshot?.bitmap ? thawSnapshot(snapshot) : undefined;
  }, () => undefined);
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

export async function syncFromCloud() {
  const fromUrl = houseCodeFromLocation();
  const fromDevice = readStoredHouseCode();
  if (fromUrl && fromDevice && fromUrl !== fromDevice) {
    await clearAllLocalData();
  }
  initHouseCode();
  const remote = await fetchHouse();
  if (!remote) {
    setCloudStatus('offline');
    return 'offline' as const;
  }
  setCloudStatus('online');
  for (const profile of remote.profiles) {
    const local = await getProfile(profile.id);
    if (!local || profile.updatedAt >= local.updatedAt) {
      await saveProfile(profile, { sync: false });
    }
  }
  for (const wire of remote.drawings) {
    const drawing = drawingFromWire(wire);
    const local = await getDrawing(drawing.id);
    if (!local || drawing.updatedAt >= local.updatedAt) {
      await saveDrawing(drawing, { sync: false });
    }
  }
  const localProfiles = await listProfiles();
  for (const profile of localProfiles) {
    const remoteProfile = remote.profiles.find((item) => item.id === profile.id);
    if (!remoteProfile || profile.updatedAt > remoteProfile.updatedAt) queueCloudProfile(profile);
  }
  const localDrawings = await listAllDrawings();
  for (const drawing of localDrawings) {
    const remoteDrawing = remote.drawings.find((item) => item.id === drawing.id);
    if (!remoteDrawing || drawing.updatedAt > remoteDrawing.updatedAt) queueCloudDrawing(drawing);
  }
  return 'online' as const;
}

export async function adoptHouseCode(code: string) {
  setHouseCode(code);
  await clearAllLocalData();
  return syncFromCloud();
}

export function currentHouseCode() {
  return getHouseCode();
}
