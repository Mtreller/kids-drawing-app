import type { Snapshot } from './drawing';
import { getHouseCode } from './house';

type CloudProfile = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  createdAt: number;
  updatedAt: number;
};

type CloudDrawing = {
  id: string;
  profileId: string;
  title: string;
  snapshot: Snapshot;
  thumbnail: Blob;
  createdAt: number;
  updatedAt: number;
};

export type CloudStatus = 'checking' | 'online' | 'offline';
export type WireBitmap = { url: string } | { mime: string; data: string };
export type WireDrawing = {
  id: string;
  profileId: string;
  title: string;
  thumbnail: WireBitmap;
  snapshot: {
    bitmap: WireBitmap;
    objects: Snapshot['objects'];
    width?: number;
    height?: number;
    baseBitmap?: WireBitmap;
    baseWidth?: number;
    baseHeight?: number;
  };
  createdAt: number;
  updatedAt: number;
};

export type HousePayload = {
  profiles: CloudProfile[];
  drawings: WireDrawing[];
};

let cloudStatus: CloudStatus = 'checking';
const listeners = new Set<(status: CloudStatus) => void>();

export function getCloudStatus() {
  return cloudStatus;
}

export function subscribeCloudStatus(listener: (status: CloudStatus) => void) {
  listeners.add(listener);
  listener(cloudStatus);
  return () => { listeners.delete(listener); };
}

export function setCloudStatus(status: CloudStatus) {
  if (cloudStatus === status) return;
  cloudStatus = status;
  listeners.forEach((listener) => listener(status));
}

export function cloudApiBase() {
  const configured = import.meta.env.VITE_CLOUD_API?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (import.meta.env.DEV) return '/api';
  return 'https://color-pop-api.mtreller.workers.dev';
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => window.clearTimeout(timer) };
}

async function cloudFetch(path: string, init: RequestInit = {}, timeoutMs = 20000) {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(`${cloudApiBase()}${path}`, {
      ...init,
      signal: timeout.signal,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json() as { error?: string }).error ?? ''; }
      catch { detail = await response.text().catch(() => ''); }
      throw new Error(detail || `Cloud save failed (${response.status}).`);
    }
    setCloudStatus('online');
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('application/json')) return response.json();
    return null;
  } catch (error) {
    setCloudStatus('offline');
    throw error;
  } finally {
    timeout.done();
  }
}

export async function fetchHouse(code = getHouseCode()): Promise<HousePayload | null> {
  try {
    return await cloudFetch(`/houses/${encodeURIComponent(code)}`) as HousePayload;
  } catch {
    return null;
  }
}

export async function putProfile(profile: CloudProfile, code = getHouseCode()) {
  await cloudFetch(`/houses/${encodeURIComponent(code)}/profiles/${encodeURIComponent(profile.id)}`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export async function deleteRemoteProfile(profileId: string, code = getHouseCode()) {
  await cloudFetch(`/houses/${encodeURIComponent(code)}/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  }, 15000);
}

export async function putDrawing(drawing: WireDrawing, code = getHouseCode()) {
  await cloudFetch(`/houses/${encodeURIComponent(code)}/drawings/${encodeURIComponent(drawing.id)}`, {
    method: 'PUT',
    body: JSON.stringify(drawing),
  }, 60000);
}

export async function deleteRemoteDrawing(drawingId: string, code = getHouseCode()) {
  await cloudFetch(`/houses/${encodeURIComponent(code)}/drawings/${encodeURIComponent(drawingId)}`, {
    method: 'DELETE',
  }, 15000);
}

export async function bitmapToWire(value: string | Blob | undefined): Promise<WireBitmap | undefined> {
  if (value == null) return undefined;
  if (typeof value === 'string') return { url: value };
  return { mime: value.type || 'image/png', data: await blobToBase64(value) };
}

export function wireToBitmap(value: WireBitmap | undefined): string | Blob | undefined {
  if (!value) return undefined;
  if ('url' in value && value.url) return value.url;
  if ('data' in value && value.data) {
    return new Blob([base64ToBytes(value.data)], { type: value.mime || 'image/png' });
  }
  return undefined;
}

export async function drawingToWire(drawing: CloudDrawing): Promise<WireDrawing> {
  const thumbnail = await bitmapToWire(drawing.thumbnail);
  const bitmap = await bitmapToWire(drawing.snapshot.bitmap);
  if (!thumbnail || !bitmap) throw new Error('Drawing is missing its picture data.');
  return {
    id: drawing.id,
    profileId: drawing.profileId,
    title: drawing.title,
    thumbnail,
    snapshot: {
      bitmap,
      objects: drawing.snapshot.objects,
      width: drawing.snapshot.width,
      height: drawing.snapshot.height,
      baseBitmap: await bitmapToWire(drawing.snapshot.baseBitmap),
      baseWidth: drawing.snapshot.baseWidth,
      baseHeight: drawing.snapshot.baseHeight,
    },
    createdAt: drawing.createdAt,
    updatedAt: drawing.updatedAt,
  };
}

export function drawingFromWire(drawing: WireDrawing): CloudDrawing {
  const thumbnail = wireToBitmap(drawing.thumbnail);
  const bitmap = wireToBitmap(drawing.snapshot.bitmap);
  return {
    id: drawing.id,
    profileId: drawing.profileId,
    title: drawing.title,
    thumbnail: thumbnail instanceof Blob ? thumbnail : new Blob(),
    snapshot: {
      bitmap: bitmap ?? drawing.snapshot.bitmap as unknown as string,
      objects: drawing.snapshot.objects ?? [],
      width: drawing.snapshot.width,
      height: drawing.snapshot.height,
      baseBitmap: wireToBitmap(drawing.snapshot.baseBitmap),
      baseWidth: drawing.snapshot.baseWidth,
      baseHeight: drawing.snapshot.baseHeight,
    },
    createdAt: drawing.createdAt,
    updatedAt: drawing.updatedAt,
  };
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBytes(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
