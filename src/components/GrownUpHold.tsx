import { useEffect, useRef, useState, type ReactNode } from 'react';

const HOLD_MS = 1300;

/**
 * A button that only fires after being held down. Little children tap; grown-ups
 * can hold. Used for settings and anything that could lose a drawing.
 */
export function GrownUpHold({ className = '', label, children, onConfirm, onTapHint, holdMs = HOLD_MS }: {
  className?: string;
  label: string;
  children: ReactNode;
  onConfirm: () => void;
  onTapHint?: () => void;
  holdMs?: number;
}) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const startedAt = useRef(0);
  const fired = useRef(false);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  };
  useEffect(() => stop, []);

  const tick = () => {
    const next = Math.min(1, (performance.now() - startedAt.current) / holdMs);
    setProgress(next);
    if (next >= 1) {
      fired.current = true;
      frame.current = null;
      setProgress(0);
      onConfirm();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  return <button
    type="button"
    className={`grown-up-hold${progress > 0 ? ' is-holding' : ''}${className ? ` ${className}` : ''}`}
    aria-label={`${label} (press and hold)`}
    title={`${label}: press and hold`}
    style={{ '--hold': progress } as React.CSSProperties}
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* optional */ }
      fired.current = false;
      startedAt.current = performance.now();
      frame.current = requestAnimationFrame(tick);
    }}
    onPointerUp={() => {
      const wasShort = !fired.current && performance.now() - startedAt.current < holdMs;
      stop();
      if (wasShort) onTapHint?.();
    }}
    onPointerCancel={stop}
    onKeyDown={(event) => {
      // Keyboard users (grown-ups at a computer) confirm with Enter or Space.
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onConfirm();
      }
    }}
  >
    <span className="grown-up-hold__ring" aria-hidden="true" />
    {children}
  </button>;
}
