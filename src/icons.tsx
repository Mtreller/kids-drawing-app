export type ToolIconName = 'brush' | 'eraser' | 'fill' | 'move' | 'shapes' | 'sticker' | 'reset' | 'droplet' | 'magic';

export function ToolIcon({ name, size = 24 }: { name: ToolIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'brush') return <svg {...common}><path d="m14.5 4.5 5 5-8.8 8.8-5.9 1 1-5.9z" /><path d="m13 6 5 5" /><path d="M4.8 19.3c-1.4.3-2.5-.8-2.1-2.2.3-1.1 1.2-1.9 2.8-2.1" /></svg>;
  if (name === 'eraser') return <svg {...common}><path d="m15.7 4.3 4 4a2 2 0 0 1 0 2.8l-7.6 7.6a2 2 0 0 1-2.8 0l-5-5a2 2 0 0 1 0-2.8l8.6-8.6a2 2 0 0 1 2.8 0Z" /><path d="m7.5 7.5 9 9" /><path d="M10 20h10" /></svg>;
  if (name === 'fill') return <svg {...common}><path d="m4.2 13.3 7.1-7.1 7.1 7.1-7.1 7.1a2 2 0 0 1-2.8 0l-4.3-4.3a2 2 0 0 1 0-2.8Z" /><path d="m7.8 9.7 6.5 6.5" /><path d="M4 14h14" /><path d="M20.5 15.5s1.7 2 1.7 3.1a1.7 1.7 0 1 1-3.4 0c0-1.1 1.7-3.1 1.7-3.1Z" /></svg>;
  if (name === 'move') return <svg {...common}><path d="M12 3v18M3 12h18" /><path d="m8 7 4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>;
  if (name === 'shapes') return <svg {...common}><rect x="3" y="4" width="10" height="10" rx="2" /><circle cx="16.5" cy="15.5" r="4.5" /></svg>;
  if (name === 'sticker') return <svg {...common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6-4.4-4.3 6.1-.9z" /></svg>;
  if (name === 'reset') return <svg {...common}><path d="M4.8 8.2A8 8 0 1 1 4 14" /><path d="M4 4v5h5" /></svg>;
  if (name === 'magic') return <svg {...common}><path d="M12 3 5.5 5.8v5.3c0 4.2 2.7 8 6.5 9.9 3.8-1.9 6.5-5.7 6.5-9.9V5.8z" /><path d="m9.2 12 1.8 1.8 3.9-4.1" /></svg>;
  return <svg {...common}><path d="M12 3s5.5 6.4 5.5 11A5.5 5.5 0 0 1 6.5 14C6.5 9.4 12 3 12 3Z" /></svg>;
}
