// Sharp on Retina tablets while keeping flood fill and region masks fast.
export const ART_WIDTH = 1600;
export const ART_HEIGHT = 1200;

export type Point = { x: number; y: number };
export type Tool = 'brush' | 'eraser' | 'fill' | 'move';
export type ArtObject = {
  id: string;
  kind: 'rectangle' | 'circle' | 'star' | 'sticker';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  sticker?: string;
};

export type Snapshot = {
  bitmap: string | Blob;
  objects: ArtObject[];
  width?: number;
  height?: number;
  baseBitmap?: string | Blob;
  baseWidth?: number;
  baseHeight?: number;
};

export function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * canvas.width / rect.width)),
    y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * canvas.height / rect.height)),
  };
}

export function drawStar(context: CanvasRenderingContext2D, radius: number, color: string) {
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const length = index % 2 === 0 ? radius : radius * .45;
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

export function drawObject(context: CanvasRenderingContext2D, object: ArtObject, selected = false) {
  context.save();
  context.translate(object.x, object.y);
  context.rotate(object.rotation);
  context.fillStyle = object.color;
  context.strokeStyle = '#28213c';
  context.lineWidth = 6;

  if (object.kind === 'rectangle') {
    context.beginPath();
    context.roundRect(-object.width / 2, -object.height / 2, object.width, object.height, 28);
    context.fill();
  } else if (object.kind === 'circle') {
    context.beginPath();
    context.ellipse(0, 0, object.width / 2, object.height / 2, 0, 0, Math.PI * 2);
    context.fill();
  } else if (object.kind === 'star') {
    drawStar(context, Math.min(object.width, object.height) / 2, object.color);
  } else {
    context.font = `${Math.min(object.width, object.height) * .82}px system-ui`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(object.sticker ?? '⭐', 0, 4);
  }

  if (selected) {
    context.setLineDash([14, 10]);
    context.strokeStyle = '#755cff';
    context.lineWidth = 7;
    context.strokeRect(-object.width / 2 - 12, -object.height / 2 - 12, object.width + 24, object.height + 24);
    context.setLineDash([]);
    const handles = [
      [-object.width / 2 - 12, -object.height / 2 - 12],
      [object.width / 2 + 12, -object.height / 2 - 12],
      [-object.width / 2 - 12, object.height / 2 + 12],
      [object.width / 2 + 12, object.height / 2 + 12],
    ];
    handles.forEach(([x, y]) => {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(x, y, 18, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#755cff';
      context.lineWidth = 8;
      context.stroke();
    });
    const rotateY = -object.height / 2 - 72;
    context.strokeStyle = '#755cff';
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(0, -object.height / 2 - 12);
    context.lineTo(0, rotateY + 18);
    context.stroke();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(0, rotateY, 20, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#755cff';
    context.font = '900 22px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('↻', 0, rotateY + 1);
  }
  context.restore();
}

export function hitResizeHandle(object: ArtObject, point: Point) {
  const cos = Math.cos(-object.rotation);
  const sin = Math.sin(-object.rotation);
  const dx = point.x - object.x;
  const dy = point.y - object.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const cornerX = object.width / 2 + 12;
  const cornerY = object.height / 2 + 12;
  return [
    [-cornerX, -cornerY], [cornerX, -cornerY],
    [-cornerX, cornerY], [cornerX, cornerY],
  ].some(([x, y]) => Math.hypot(localX - x, localY - y) <= 34);
}

export function hitRotateHandle(object: ArtObject, point: Point) {
  const cos = Math.cos(-object.rotation);
  const sin = Math.sin(-object.rotation);
  const dx = point.x - object.x;
  const dy = point.y - object.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.hypot(localX, localY + object.height / 2 + 72) <= 38;
}

export function hitObject(objects: ArtObject[], point: Point) {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    const cos = Math.cos(-object.rotation);
    const sin = Math.sin(-object.rotation);
    const dx = point.x - object.x;
    const dy = point.y - object.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    if (Math.abs(localX) <= object.width / 2 + 20 && Math.abs(localY) <= object.height / 2 + 20) return object;
  }
  return null;
}

export function fillRegion(canvas: HTMLCanvasElement, point: Point, color: string, tolerance = 32) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const width = canvas.width;
  const height = canvas.height;
  const image = context.getImageData(0, 0, width, height);
  const x = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
  const start = (y * width + x) * 4;
  const target = [image.data[start], image.data[start + 1], image.data[start + 2], image.data[start + 3]];
  const fill = hexToRgba(color);
  if (target.slice(0, 3).every((value, index) => Math.abs(value - fill[index]) < 3)) return false;

  const matches = (offset: number) =>
    Math.abs(image.data[offset] - target[0]) <= tolerance &&
    Math.abs(image.data[offset + 1] - target[1]) <= tolerance &&
    Math.abs(image.data[offset + 2] - target[2]) <= tolerance &&
    Math.abs(image.data[offset + 3] - target[3]) <= tolerance;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const edges: number[] = [];
  const firstPixel = y * width + x;
  queue[0] = firstPixel;
  visited[firstPixel] = 1;
  let head = 0;
  let tail = 1;
  let changed = 0;

  while (head < tail) {
    const pixel = queue[head++];
    const cx = pixel % width;
    const cy = Math.floor(pixel / width);
    const offset = pixel * 4;
    if (!matches(offset)) continue;
    image.data[offset] = fill[0];
    image.data[offset + 1] = fill[1];
    image.data[offset + 2] = fill[2];
    image.data[offset + 3] = 255;
    changed += 1;
    const neighbors = [
      cx < width - 1 ? pixel + 1 : -1,
      cx > 0 ? pixel - 1 : -1,
      cy < height - 1 ? pixel + width : -1,
      cy > 0 ? pixel - width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor]) continue;
      visited[neighbor] = 1;
      if (matches(neighbor * 4)) queue[tail++] = neighbor;
      else edges.push(neighbor);
    }
  }
  if (!changed) return false;
  recolorFringe(image.data, width, height, edges, visited, target, fill);
  context.putImageData(image, 0, 0);
  return true;
}

const luminance = (red: number, green: number, blue: number) => .2126 * red + .7152 * green + .0722 * blue;

/**
 * Anti-aliased line art leaves a ring of light grey pixels that a plain flood
 * fill skips, so filled areas get a white halo. Treat each fringe pixel as a
 * blend of the old colour and a dark line, then swap the old colour for the new
 * one. Lines stay smooth and dark; colourful neighbours are left alone.
 */
export function recolorFringe(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  edges: number[],
  visited: Uint8Array,
  target: number[],
  fill: number[],
) {
  const targetLight = luminance(target[0], target[1], target[2]);
  if (targetLight < 40 || target[3] < 200) return;
  let ring = edges;
  for (let pass = 0; pass < 2 && ring.length; pass += 1) {
    const next: number[] = [];
    for (const pixel of ring) {
      const offset = pixel * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const share = Math.min(1, luminance(red, green, blue) / targetLight);
      if (share < .08) continue;
      // The pixel must look like "old colour mixed with near-black".
      if (
        Math.abs(red - target[0] * share) > 46 ||
        Math.abs(green - target[1] * share) > 46 ||
        Math.abs(blue - target[2] * share) > 46
      ) continue;
      data[offset] = red + share * (fill[0] - target[0]);
      data[offset + 1] = green + share * (fill[1] - target[1]);
      data[offset + 2] = blue + share * (fill[2] - target[2]);
      visited[pixel] = 2;
      if (pass > 0 || share < .3) continue;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x < width - 1 && !visited[pixel + 1]) { visited[pixel + 1] = 3; next.push(pixel + 1); }
      if (x > 0 && !visited[pixel - 1]) { visited[pixel - 1] = 3; next.push(pixel - 1); }
      if (y < height - 1 && !visited[pixel + width]) { visited[pixel + width] = 3; next.push(pixel + width); }
      if (y > 0 && !visited[pixel - width]) { visited[pixel - width] = 3; next.push(pixel - width); }
    }
    ring = next;
  }
}

function hexToRgba(hex: string) {
  const raw = hex.replace('#', '');
  const value = Number.parseInt(raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw, 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

export function newObject(kind: ArtObject['kind'], color: string, sticker?: string, canvasWidth = ART_WIDTH, canvasHeight = ART_HEIGHT): ArtObject {
  // Keep new shapes a similar size on screen whatever the page resolution.
  const scale = Math.max(.8, Math.min(1.6, Math.min(canvasWidth, canvasHeight) / 900));
  return {
    id: crypto.randomUUID(), kind, x: canvasWidth / 2, y: canvasHeight / 2,
    width: (kind === 'rectangle' ? 250 : 210) * scale, height: 210 * scale, rotation: 0, color, sticker,
  };
}
