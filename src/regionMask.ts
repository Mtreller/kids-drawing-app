import type { Point } from './drawing';

export type RegionMaskCache = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  labels: Int32Array;
  nextLabel: number;
  masks: Map<number, HTMLCanvasElement>;
};

export function copyCanvas(source: HTMLCanvasElement) {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}

export function createRegionMaskCache(source: HTMLCanvasElement): RegionMaskCache | null {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  return {
    width: source.width,
    height: source.height,
    pixels: context.getImageData(0, 0, source.width, source.height).data,
    labels: new Int32Array(source.width * source.height),
    nextLabel: 1,
    masks: new Map(),
  };
}

function isOutline(cache: RegionMaskCache, pixel: number) {
  const offset = pixel * 4;
  const red = cache.pixels[offset];
  const green = cache.pixels[offset + 1];
  const blue = cache.pixels[offset + 2];
  const alpha = cache.pixels[offset + 3];
  const darkest = Math.min(red, green, blue);
  const brightest = Math.max(red, green, blue);
  return alpha > 20 && (brightest < 82 || (brightest < 158 && brightest - darkest < 42));
}

function findPaintablePixel(cache: RegionMaskCache, point: Point) {
  const startX = Math.max(0, Math.min(cache.width - 1, Math.round(point.x)));
  const startY = Math.max(0, Math.min(cache.height - 1, Math.round(point.y)));
  const start = startY * cache.width + startX;
  if (!isOutline(cache, start)) return start;

  for (let radius = 1; radius <= 18; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.abs(x) !== radius && Math.abs(y) !== radius) continue;
        const candidateX = startX + x;
        const candidateY = startY + y;
        if (candidateX < 0 || candidateX >= cache.width || candidateY < 0 || candidateY >= cache.height) continue;
        const candidate = candidateY * cache.width + candidateX;
        if (!isOutline(cache, candidate)) return candidate;
      }
    }
  }
  return -1;
}

function canvasForLabel(cache: RegionMaskCache, label: number, pixels?: Int32Array, count?: number) {
  const canvas = document.createElement('canvas');
  canvas.width = cache.width;
  canvas.height = cache.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const mask = context.createImageData(cache.width, cache.height);

  if (pixels && typeof count === 'number') {
    for (let index = 0; index < count; index += 1) {
      const offset = pixels[index] * 4;
      mask.data[offset] = 255;
      mask.data[offset + 1] = 255;
      mask.data[offset + 2] = 255;
      mask.data[offset + 3] = 255;
    }
  } else {
    for (let pixel = 0; pixel < cache.labels.length; pixel += 1) {
      if (cache.labels[pixel] !== label) continue;
      const offset = pixel * 4;
      mask.data[offset] = 255;
      mask.data[offset + 1] = 255;
      mask.data[offset + 2] = 255;
      mask.data[offset + 3] = 255;
    }
  }

  context.putImageData(mask, 0, 0);
  if (cache.masks.size >= 3) cache.masks.delete(cache.masks.keys().next().value!);
  cache.masks.set(label, canvas);
  return canvas;
}

export function getRegionMask(cache: RegionMaskCache, point: Point) {
  const firstPixel = findPaintablePixel(cache, point);
  if (firstPixel < 0) return null;
  const knownLabel = cache.labels[firstPixel];
  if (knownLabel > 0) return cache.masks.get(knownLabel) ?? canvasForLabel(cache, knownLabel);

  const label = cache.nextLabel++;
  const queue = new Int32Array(cache.width * cache.height);
  queue[0] = firstPixel;
  cache.labels[firstPixel] = label;
  let head = 0;
  let tail = 1;

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % cache.width;
    const y = Math.floor(pixel / cache.width);
    const neighbors = [
      x < cache.width - 1 ? pixel + 1 : -1,
      x > 0 ? pixel - 1 : -1,
      y < cache.height - 1 ? pixel + cache.width : -1,
      y > 0 ? pixel - cache.width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || cache.labels[neighbor] !== 0) continue;
      if (isOutline(cache, neighbor)) {
        cache.labels[neighbor] = -1;
        continue;
      }
      cache.labels[neighbor] = label;
      queue[tail++] = neighbor;
    }
  }

  if (tail < 4) return null;
  return canvasForLabel(cache, label, queue, tail);
}

export function drawMaskedLine({
  backing, mask, scratch, from, to, color, lineWidth, alpha,
}: {
  backing: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  from: Point;
  to: Point;
  color: string;
  lineWidth: number;
  alpha: number;
}) {
  const padding = Math.ceil(lineWidth / 2 + 4);
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - padding));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - padding));
  const right = Math.min(backing.width, Math.ceil(Math.max(from.x, to.x) + padding));
  const bottom = Math.min(backing.height, Math.ceil(Math.max(from.y, to.y) + padding));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  const backingContext = backing.getContext('2d');
  if (!context || !backingContext) return false;

  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x - left, from.y - top);
  context.lineTo(to.x - left, to.y - top);
  context.stroke();
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(mask, left, top, width, height, 0, 0, width, height);

  backingContext.save();
  backingContext.globalCompositeOperation = 'source-over';
  backingContext.drawImage(scratch, left, top);
  backingContext.restore();
  return true;
}

export function restoreBaseLine({
  backing, base, mask, scratch, from, to, lineWidth, alpha,
}: {
  backing: HTMLCanvasElement;
  base: HTMLCanvasElement;
  mask?: HTMLCanvasElement | null;
  scratch: HTMLCanvasElement;
  from: Point;
  to: Point;
  lineWidth: number;
  alpha: number;
}) {
  const padding = Math.ceil(lineWidth / 2 + 4);
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - padding));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - padding));
  const right = Math.min(backing.width, Math.ceil(Math.max(from.x, to.x) + padding));
  const bottom = Math.min(backing.height, Math.ceil(Math.max(from.y, to.y) + padding));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  const backingContext = backing.getContext('2d');
  if (!context || !backingContext) return false;

  // Restore the untouched page through the eraser stroke. Paint and fills are
  // removed, while every pixel belonging to the original outline is preserved.
  context.drawImage(base, left, top, width, height, 0, 0, width, height);
  context.globalCompositeOperation = 'destination-in';
  context.globalAlpha = alpha;
  context.strokeStyle = '#000000';
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x - left, from.y - top);
  context.lineTo(to.x - left, to.y - top);
  context.stroke();
  context.globalAlpha = 1;
  if (mask) context.drawImage(mask, left, top, width, height, 0, 0, width, height);

  backingContext.save();
  backingContext.globalCompositeOperation = 'source-over';
  backingContext.drawImage(scratch, left, top);
  backingContext.restore();
  return true;
}
