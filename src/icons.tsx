export type ToolIconName =
  | 'brush' | 'eraser' | 'fill' | 'move' | 'shapes' | 'sticker' | 'reset' | 'droplet' | 'magic'
  | 'undo' | 'redo' | 'focus' | 'library' | 'more' | 'close' | 'upload' | 'download'
  | 'newCanvas' | 'rotateLeft' | 'rotateRight' | 'fit' | 'plus' | 'page' | 'handedness' | 'continue' | 'chevronRight';

type IconProps = { name: ToolIconName; size?: number };

const common = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.85,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function ToolIcon({ name, size = 24 }: IconProps) {
  const svg = common(size);

  if (name === 'brush') return <svg {...svg}>
    <path d="M14.2 3.8c1.2-1.2 3.2-1.2 4.4 0l1.6 1.6c1.2 1.2 1.2 3.2 0 4.4l-7.6 7.6-6.4 1.4 1.4-6.4z" />
    <path d="m13.4 6.2 4.4 4.4" />
    <path d="M5.2 19.6c-1.6.2-2.8-1-2.4-2.6.4-1.3 1.5-2.1 3.4-2.2" />
  </svg>;
  if (name === 'eraser') return <svg {...svg}>
    <path d="m15.4 4.2 4.4 4.4a2.1 2.1 0 0 1 0 3l-7.8 7.8a2.1 2.1 0 0 1-3 0l-4.4-4.4a2.1 2.1 0 0 1 0-3l8.8-8.8a2.1 2.1 0 0 1 3 0Z" />
    <path d="m8 8.4 8.2 8.2" />
    <path d="M9.5 20.2h10.2" />
  </svg>;
  if (name === 'fill') return <svg {...svg}>
    <path d="m4 13.2 7.2-7.2 7.2 7.2-7.2 7.2a2 2 0 0 1-2.8 0L4 16a2 2 0 0 1 0-2.8Z" />
    <path d="M4.2 14.2h13.8" />
    <path d="M20.4 15.4s1.8 2.1 1.8 3.4a1.8 1.8 0 1 1-3.6 0c0-1.3 1.8-3.4 1.8-3.4Z" />
  </svg>;
  if (name === 'move') return <svg {...svg}>
    <path d="M12 3.2v17.6M3.2 12h17.6" />
    <path d="m8.2 7.2 3.8-4 3.8 4M8.2 16.8l3.8 4 3.8-4M7.2 8.2l-4 3.8 4 3.8M16.8 8.2l4 3.8-4 3.8" />
  </svg>;
  if (name === 'shapes') return <svg {...svg}>
    <rect x="3.2" y="3.8" width="10.2" height="10.2" rx="2.2" />
    <circle cx="16.4" cy="16" r="4.4" />
  </svg>;
  if (name === 'sticker') return <svg {...svg}>
    <path d="m12 3.2 2.5 5.2 5.8.8-4.2 4.1 1 5.7L12 16.4l-5.1 2.6 1-5.7-4.2-4.1 5.8-.8z" />
  </svg>;
  if (name === 'reset') return <svg {...svg}>
    <path d="M5 8.4A8 8 0 1 1 4.2 14" />
    <path d="M4.2 4.2v5.2h5.2" />
  </svg>;
  if (name === 'magic') return <svg {...svg}>
    <path d="M12 3.2 5.6 5.8v5.4c0 4.1 2.6 7.8 6.4 9.6 3.8-1.8 6.4-5.5 6.4-9.6V5.8z" />
    <path d="m9.3 12.1 1.8 1.8 3.8-4" />
  </svg>;
  if (name === 'droplet') return <svg {...svg}>
    <path d="M12 3.2s5.4 6.2 5.4 10.8A5.4 5.4 0 0 1 6.6 14C6.6 9.4 12 3.2 12 3.2Z" />
  </svg>;
  if (name === 'undo') return <svg {...svg}>
    <path d="M8.2 7.2 4.4 11l3.8 3.8" />
    <path d="M4.4 11h9.4a5.2 5.2 0 1 1 0 10.4H8" />
  </svg>;
  if (name === 'redo') return <svg {...svg}>
    <path d="m15.8 7.2 3.8 3.8-3.8 3.8" />
    <path d="M19.6 11H10.2a5.2 5.2 0 1 0 0 10.4H16" />
  </svg>;
  if (name === 'focus') return <svg {...svg}>
    <path d="M8 3.6H5.2A1.6 1.6 0 0 0 3.6 5.2V8M16 3.6h2.8A1.6 1.6 0 0 1 20.4 5.2V8M8 20.4H5.2A1.6 1.6 0 0 1 3.6 18.8V16M16 20.4h2.8a1.6 1.6 0 0 0 1.6-1.6V16" />
  </svg>;
  if (name === 'library') return <svg {...svg}>
    <rect x="3.4" y="4.2" width="7.2" height="7.2" rx="1.6" />
    <rect x="13.4" y="4.2" width="7.2" height="7.2" rx="1.6" />
    <rect x="3.4" y="12.6" width="7.2" height="7.2" rx="1.6" />
    <rect x="13.4" y="12.6" width="7.2" height="7.2" rx="1.6" />
  </svg>;
  if (name === 'more') return <svg {...svg}>
    <circle cx="6" cy="12" r="1.55" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.55" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.55" fill="currentColor" stroke="none" />
  </svg>;
  if (name === 'close') return <svg {...svg}>
    <path d="m7 7 10 10M17 7 7 17" />
  </svg>;
  if (name === 'upload') return <svg {...svg}>
    <path d="M12 15.6V5.2" />
    <path d="m8.2 8.6 3.8-3.8 3.8 3.8" />
    <path d="M5 18.8h14" />
  </svg>;
  if (name === 'download') return <svg {...svg}>
    <path d="M12 5.2v10.4" />
    <path d="m8.2 12.2 3.8 3.8 3.8-3.8" />
    <path d="M5 18.8h14" />
  </svg>;
  if (name === 'newCanvas') return <svg {...svg}>
    <rect x="4.2" y="3.8" width="15.6" height="16.4" rx="2.2" />
    <path d="M8.2 12h7.6M12 8.2v7.6" />
  </svg>;
  if (name === 'rotateLeft') return <svg {...svg}>
    <path d="M8.4 7.4 4.8 11l3.6 3.6" />
    <path d="M4.8 11h8.6a5.2 5.2 0 1 1 0 10.4" />
  </svg>;
  if (name === 'rotateRight') return <svg {...svg}>
    <path d="m15.6 7.4 3.6 3.6-3.6 3.6" />
    <path d="M19.2 11H10.6a5.2 5.2 0 1 0 0 10.4" />
  </svg>;
  if (name === 'fit') return <svg {...svg}>
    <path d="M8.2 4.4H4.4v3.8M15.8 4.4h3.8v3.8M8.2 19.6H4.4v-3.8M15.8 19.6h3.8v-3.8" />
    <rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1.2" />
  </svg>;
  if (name === 'plus') return <svg {...svg}>
    <path d="M12 5.4v13.2M5.4 12h13.2" />
  </svg>;
  if (name === 'page') return <svg {...svg}>
    <path d="M7.2 3.8h6.6L19 9v11.2a1.6 1.6 0 0 1-1.6 1.6H7.2A1.6 1.6 0 0 1 5.6 20.2V5.4A1.6 1.6 0 0 1 7.2 3.8Z" />
    <path d="M13.6 3.8V9H19" />
  </svg>;
  if (name === 'continue') return <svg {...svg}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="m10.2 8.4 5.2 3.6-5.2 3.6z" />
  </svg>;
  if (name === 'chevronRight') return <svg {...svg}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </svg>;
  if (name === 'handedness') return <svg {...svg}>
    <path d="M8.2 8.2 4.6 12l3.6 3.8" />
    <path d="M15.8 8.2 19.4 12l-3.6 3.8" />
    <path d="M4.6 12h14.8" />
  </svg>;
  return <svg {...svg}><circle cx="12" cy="12" r="7" /></svg>;
}
