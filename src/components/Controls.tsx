import type { CSSProperties, ReactNode } from 'react';

const rangeStyle = (value: number, minimum: number, maximum: number) => ({
  '--range-progress': `${(value - minimum) / (maximum - minimum) * 100}%`,
} as CSSProperties);

export function IconButton({ icon, label, active = false, disabled = false, className = '', onClick }: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return <button
    className={`icon-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  ><span aria-hidden="true">{icon}</span></button>;
}

export function VerticalRange({ label, minimum, maximum, value, onChange }: {
  label: string;
  minimum: number;
  maximum: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onChange(Math.round(minimum + progress * (maximum - minimum)));
  };
  return <div
    className="vertical-range-wrap"
    onPointerDown={(event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.querySelector('input')?.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromPointer(event);
    }}
    onPointerMove={(event) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
    }}
    onPointerUp={updateFromPointer}
  >
    <input
      className="polished-range"
      style={rangeStyle(value, minimum, maximum)}
      aria-label={label}
      type="range"
      min={minimum}
      max={maximum}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </div>;
}
