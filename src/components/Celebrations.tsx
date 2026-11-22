import { useEffect, useState } from 'react';

export type Burst = { id: number; x: number; y: number; color: string; big?: boolean };

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Little sparkle bursts at a screen point: fills, stickers, colour picks. */
export function SparkleLayer({ bursts }: { bursts: Burst[] }) {
  if (reducedMotion()) return null;
  return <div className="sparkle-layer" aria-hidden="true">
    {bursts.map((burst) => <span key={burst.id} className={`sparkle-burst${burst.big ? ' is-big' : ''}`} style={{ left: burst.x, top: burst.y }}>
      {Array.from({ length: burst.big ? 12 : 8 }, (_, index) => <i
        key={index}
        style={{
          '--angle': `${index * (360 / (burst.big ? 12 : 8))}deg`,
          '--spark': index % 3 === 0 ? '#ffd83d' : index % 3 === 1 ? burst.color : '#ffffff',
        } as React.CSSProperties}
      />)}
    </span>)}
  </div>;
}

/** Full-screen "you did it" moment after saving. */
export function Celebration({ show, emoji, label, onDone }: { show: boolean; emoji: string; label: string; onDone: () => void }) {
  const [pieces] = useState(() => Array.from({ length: 26 }, (_, index) => ({
    left: (index * 37) % 100,
    delay: (index % 7) * .07,
    color: ['#ff385d', '#ffc93c', '#4fdd89', '#3199f4', '#a855f7', '#ff9f43'][index % 6],
    turn: (index % 2 ? 1 : -1) * (180 + index * 23),
  })));
  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(onDone, 1700);
    return () => window.clearTimeout(timer);
  }, [show, onDone]);
  if (!show) return null;
  return <div className="celebration" role="status" aria-live="polite" onPointerDown={onDone}>
    {!reducedMotion() && pieces.map((piece, index) => <i
      key={index}
      className="celebration__confetti"
      style={{ left: `${piece.left}%`, animationDelay: `${piece.delay}s`, background: piece.color, '--turn': `${piece.turn}deg` } as React.CSSProperties}
    />)}
    <div className="celebration__badge"><span aria-hidden="true">{emoji}</span><b>{label}</b></div>
  </div>;
}
