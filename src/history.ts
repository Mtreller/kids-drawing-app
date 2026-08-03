import type { Snapshot } from './drawing';

const HISTORY_LIMIT_BYTES = 24 * 1024 * 1024;
const HISTORY_LIMIT_ENTRIES = 18;
const HISTORY_MIN_ENTRIES = 3;

export function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The canvas could not be compressed.'));
    }, 'image/png');
  });
}

export function bitmapSource(bitmap: string | Blob) {
  if (typeof bitmap === 'string') return { url: bitmap, release: () => undefined };
  const url = URL.createObjectURL(bitmap);
  return { url, release: () => URL.revokeObjectURL(url) };
}

export function snapshotBytes(snapshot: Snapshot) {
  const bitmapBytes = typeof snapshot.bitmap === 'string'
    ? Math.ceil(snapshot.bitmap.length * .75)
    : snapshot.bitmap.size;
  return bitmapBytes + snapshot.objects.length * 160 + 256;
}

export function trimHistory(snapshots: Snapshot[]) {
  let total = snapshots.reduce((sum, snapshot) => sum + snapshotBytes(snapshot), 0);
  while (
    snapshots.length > HISTORY_MIN_ENTRIES &&
    (snapshots.length > HISTORY_LIMIT_ENTRIES || total > HISTORY_LIMIT_BYTES)
  ) {
    total -= snapshotBytes(snapshots.shift()!);
  }
  return total;
}
