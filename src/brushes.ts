import type { Point } from './drawing';

export type BrushType = 'round' | 'pencil' | 'marker' | 'paint' | 'airbrush' | 'oil' | 'chalk' | 'rainbow' | 'glitter' | 'clouds' | 'fire' | 'water' | 'neon';

export type BrushPreset = {
  id: BrushType;
  name: string;
  icon: string;
  group: 'Favorites' | 'Paint & texture' | 'Magic';
  description: string;
};

export const brushPresets: BrushPreset[] = [
  { id: 'round', name: 'Round', icon: '●', group: 'Favorites', description: 'Smooth everyday brush' },
  { id: 'pencil', name: 'Pencil', icon: '✎', group: 'Favorites', description: 'Fine sketchy lines' },
  { id: 'marker', name: 'Marker', icon: '▰', group: 'Favorites', description: 'Bold even color' },
  { id: 'paint', name: 'Paint', icon: '🖌️', group: 'Favorites', description: 'Soft visible bristles' },
  { id: 'airbrush', name: 'Airbrush', icon: '💨', group: 'Favorites', description: 'Gentle sprayed edges' },
  { id: 'oil', name: 'Oil', icon: '🎨', group: 'Paint & texture', description: 'Rich layered ridges' },
  { id: 'chalk', name: 'Chalk', icon: '▥', group: 'Paint & texture', description: 'Dry grainy texture' },
  { id: 'rainbow', name: 'Rainbow', icon: '🌈', group: 'Magic', description: 'Six colors at once' },
  { id: 'glitter', name: 'Glitter', icon: '✨', group: 'Magic', description: 'Sparkly color trail' },
  { id: 'clouds', name: 'Clouds', icon: '☁️', group: 'Magic', description: 'Fluffy cloud puffs' },
  { id: 'fire', name: 'Fire', icon: '🔥', group: 'Magic', description: 'Warm dancing flames' },
  { id: 'water', name: 'Water', icon: '💧', group: 'Magic', description: 'Cool flowing waves' },
  { id: 'neon', name: 'Neon', icon: '⚡', group: 'Magic', description: 'Bright glowing light' },
];

type StrokeOptions = {
  from: Point;
  to: Point;
  color: string;
  size: number;
  alpha: number;
  type: BrushType;
};

function colorChannels(color: string) {
  const normalized = color.startsWith('#') ? color.slice(1) : color;
  const value = normalized.length === 3 ? normalized.split('').map((part) => part + part).join('') : normalized;
  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed) || value.length !== 6) return { red: 49, green: 103, blue: 244 };
  return { red: parsed >> 16, green: parsed >> 8 & 255, blue: parsed & 255 };
}

function rgba(color: string, alpha: number, mix = 0) {
  const { red, green, blue } = colorChannels(color);
  const target = mix >= 0 ? 255 : 0;
  const amount = Math.abs(mix);
  return `rgba(${Math.round(red + (target - red) * amount)}, ${Math.round(green + (target - green) * amount)}, ${Math.round(blue + (target - blue) * amount)}, ${Math.max(0, Math.min(1, alpha))})`;
}

function randomFor(from: Point, to: Point, type: BrushType) {
  let seed = (Math.round(from.x * 17) ^ Math.round(from.y * 31) ^ Math.round(to.x * 47) ^ Math.round(to.y * 73) ^ type.length * 997) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function alongStroke(from: Point, to: Point, spacing: number, callback: (point: Point, progress: number) => void) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.min(72, Math.ceil(distance / Math.max(1, spacing))));
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    callback({ x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }, progress);
  }
}

function line(context: CanvasRenderingContext2D, from: Point, to: Point, color: string, width: number, alpha: number, cap: CanvasLineCap = 'round') {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = cap;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

export function renderBrushStroke(context: CanvasRenderingContext2D, options: StrokeOptions) {
  const { from, to, color, size, alpha, type } = options;
  const random = randomFor(from, to, type);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };

  if (type === 'round') {
    line(context, from, to, color, size, alpha);
    return;
  }
  if (type === 'marker') {
    line(context, from, to, color, size * .82, Math.min(1, alpha * .92), 'square');
    return;
  }
  if (type === 'pencil') {
    line(context, from, to, color, Math.max(1.2, size * .16), Math.min(1, alpha * .82));
    for (let strand = 0; strand < 3; strand += 1) {
      const offset = (random() - .5) * size * .22;
      line(context, { x: from.x + normal.x * offset, y: from.y + normal.y * offset }, { x: to.x + normal.x * offset, y: to.y + normal.y * offset }, color, Math.max(.7, size * .035), alpha * .24);
    }
    return;
  }
  if (type === 'paint' || type === 'oil') {
    const bristles = type === 'oil' ? 9 : 7;
    line(context, from, to, color, size * (type === 'oil' ? .82 : .68), alpha * (type === 'oil' ? .74 : .52));
    for (let strand = 0; strand < bristles; strand += 1) {
      const offset = (strand / (bristles - 1) - .5) * size * .78 + (random() - .5) * size * .08;
      const strandColor = type === 'oil' ? rgba(color, 1, strand % 2 ? .2 : -.18) : color;
      line(context, { x: from.x + normal.x * offset, y: from.y + normal.y * offset }, { x: to.x + normal.x * offset, y: to.y + normal.y * offset }, strandColor, Math.max(1, size * (type === 'oil' ? .075 : .045)), alpha * (type === 'oil' ? .72 : .48));
    }
    return;
  }
  if (type === 'airbrush') {
    alongStroke(from, to, Math.max(3, size * .12), (point) => {
      for (let dot = 0; dot < 20; dot += 1) {
        const radius = Math.sqrt(random()) * size * .62;
        const dotAngle = random() * Math.PI * 2;
        context.fillStyle = rgba(color, alpha * .10 * (1 - radius / (size * .75)));
        context.beginPath();
        context.arc(point.x + Math.cos(dotAngle) * radius, point.y + Math.sin(dotAngle) * radius, Math.max(.7, size * (.012 + random() * .018)), 0, Math.PI * 2);
        context.fill();
      }
    });
    return;
  }
  if (type === 'chalk') {
    line(context, from, to, color, size * .66, alpha * .28);
    alongStroke(from, to, Math.max(2, size * .08), (point) => {
      for (let grain = 0; grain < 7; grain += 1) {
        const offsetX = (random() - .5) * size;
        const offsetY = (random() - .5) * size;
        context.fillStyle = rgba(color, alpha * (.16 + random() * .25));
        context.fillRect(point.x + offsetX, point.y + offsetY, Math.max(1, size * .025), Math.max(1, size * .025));
      }
    });
    return;
  }
  if (type === 'rainbow') {
    const rainbow = ['#ff385d', '#ff9f43', '#ffd83d', '#3fce7b', '#3199f4', '#9b5de5'];
    rainbow.forEach((rainbowColor, index) => {
      const offset = (index - 2.5) * size * .14;
      line(context, { x: from.x + normal.x * offset, y: from.y + normal.y * offset }, { x: to.x + normal.x * offset, y: to.y + normal.y * offset }, rainbowColor, Math.max(2, size * .17), alpha * .9);
    });
    return;
  }
  if (type === 'glitter') {
    line(context, from, to, rgba(color, 1, .25), size * .34, alpha * .34);
    alongStroke(from, to, Math.max(4, size * .2), (point) => {
      const offset = (random() - .5) * size;
      const sparkle = Math.max(1.5, size * (.035 + random() * .055));
      context.save();
      context.translate(point.x + normal.x * offset, point.y + normal.y * offset);
      context.rotate(Math.PI / 4);
      context.fillStyle = random() > .42 ? rgba(color, alpha, .72) : `rgba(255,255,255,${alpha})`;
      context.fillRect(-sparkle / 2, -sparkle * 1.5, sparkle, sparkle * 3);
      context.fillRect(-sparkle * 1.5, -sparkle / 2, sparkle * 3, sparkle);
      context.restore();
    });
    return;
  }
  if (type === 'clouds') {
    alongStroke(from, to, Math.max(5, size * .28), (point) => {
      for (let puff = 0; puff < 4; puff += 1) {
        const puffSize = size * (.24 + random() * .28);
        context.fillStyle = rgba(color, alpha * .18, .72);
        context.beginPath();
        context.arc(point.x + (random() - .5) * size * .55, point.y + (random() - .5) * size * .42, puffSize, 0, Math.PI * 2);
        context.fill();
      }
    });
    return;
  }
  if (type === 'fire') {
    alongStroke(from, to, Math.max(4, size * .2), (point) => {
      const flameColors = ['#ff2f2f', '#ff7b22', '#ffd53f'];
      flameColors.forEach((flameColor, index) => {
        const flameSize = size * (.30 - index * .055);
        context.fillStyle = rgba(flameColor, alpha * (.34 + index * .14));
        context.beginPath();
        context.ellipse(point.x + (random() - .5) * size * .25, point.y - index * size * .16 - random() * size * .22, flameSize, flameSize * 1.35, (random() - .5) * .35, 0, Math.PI * 2);
        context.fill();
      });
    });
    return;
  }
  if (type === 'water') {
    const waterColors = ['#b9f3ff', '#38c9d8', '#267cff'];
    waterColors.forEach((waterColor, index) => {
      const offset = (index - 1) * size * .19;
      line(context, { x: from.x + normal.x * offset, y: from.y + normal.y * offset }, { x: to.x + normal.x * offset, y: to.y + normal.y * offset }, waterColor, Math.max(2, size * .19), alpha * (.38 + index * .16));
    });
    alongStroke(from, to, Math.max(10, size * .65), (point) => {
      context.fillStyle = `rgba(220,250,255,${alpha * .72})`;
      context.beginPath();
      context.arc(point.x + (random() - .5) * size, point.y + (random() - .5) * size * .6, Math.max(1.5, size * .055), 0, Math.PI * 2);
      context.fill();
    });
    return;
  }
  if (type === 'neon') {
    context.save();
    context.shadowColor = color;
    context.shadowBlur = size * .52;
    line(context, from, to, color, size * .42, alpha * .72);
    context.restore();
    line(context, from, to, rgba(color, 1, .78), Math.max(1.5, size * .11), alpha);
  }
}

export function drawBrushStroke({ backing, mask, scratch, ...options }: StrokeOptions & {
  backing: HTMLCanvasElement;
  mask?: HTMLCanvasElement | null;
  scratch: HTMLCanvasElement;
}) {
  const backingContext = backing.getContext('2d');
  if (!backingContext) return false;
  if (!mask) {
    renderBrushStroke(backingContext, options);
    return true;
  }

  const padding = Math.ceil(options.size * 1.9 + 12);
  const left = Math.max(0, Math.floor(Math.min(options.from.x, options.to.x) - padding));
  const top = Math.max(0, Math.floor(Math.min(options.from.y, options.to.y) - padding));
  const right = Math.min(backing.width, Math.ceil(Math.max(options.from.x, options.to.x) + padding));
  const bottom = Math.min(backing.height, Math.ceil(Math.max(options.from.y, options.to.y) + padding));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  if (!context) return false;
  context.save();
  context.translate(-left, -top);
  renderBrushStroke(context, options);
  context.restore();
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(mask, left, top, width, height, 0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  backingContext.drawImage(scratch, left, top);
  return true;
}
