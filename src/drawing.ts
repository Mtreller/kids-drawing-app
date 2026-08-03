export const ART_WIDTH = 1200;
export const ART_HEIGHT = 900;

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
  bitmap: string;
  objects: ArtObject[];
  width?: number;
  height?: number;
  baseBitmap?: string;
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
    }
  }
  if (!changed) return false;
  context.putImageData(image, 0, 0);
  return true;
}

function hexToRgba(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

export function newObject(kind: ArtObject['kind'], color: string, sticker?: string, canvasWidth = ART_WIDTH, canvasHeight = ART_HEIGHT): ArtObject {
  return {
    id: crypto.randomUUID(), kind, x: canvasWidth / 2, y: canvasHeight / 2,
    width: kind === 'rectangle' ? 250 : 210, height: 210, rotation: 0, color, sticker,
  };
}
