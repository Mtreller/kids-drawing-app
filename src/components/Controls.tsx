import type { CSSProperties, ReactNode } from 'react';

const LOG_SLIDER_STEPS = 1000;

export function sizeToProgress(size: number, minimum: number, maximum: number) {
  const lo = Math.max(1, minimum);
  const hi = Math.max(lo + 1, maximum);
  const clamped = Math.min(hi, Math.max(lo, size));
  return Math.log(clamped / lo) / Math.log(hi / lo);
}

export function progressToSize(progress: number, minimum: number, maximum: number) {
  const lo = Math.max(1, minimum);
  const hi = Math.max(lo + 1, maximum);
  const t = Math.max(0, Math.min(1, progress));
  return Math.round(lo * (hi / lo) ** t);
}

function rangeProgress(value: number, minimum: number, maximum: number, scale: 'linear' | 'log') {
  if (scale === 'log') return sizeToProgress(value, minimum, maximum);
  return (value - minimum) / (maximum - minimum);
}

function rangeFromProgress(progress: number, minimum: number, maximum: number, scale: 'linear' | 'log') {
  if (scale === 'log') return progressToSize(progress, minimum, maximum);
  return Math.round(minimum + progress * (maximum - minimum));
}

const rangeStyle = (value: number, minimum: number, maximum: number, scale: 'linear' | 'log' = 'linear') => ({
  '--range-progress': `${rangeProgress(value, minimum, maximum, scale) * 100}%`,
} as CSSProperties);

export function logRangeInputProps(value: number, minimum: number, maximum: number) {
  const sliderValue = Math.round(sizeToProgress(value, minimum, maximum) * LOG_SLIDER_STEPS);
  return {
    min: 0,
    max: LOG_SLIDER_STEPS,
    value: sliderValue,
    style: { '--range-progress': `${sliderValue / LOG_SLIDER_STEPS * 100}%` } as CSSProperties,
    toSize: (slider: number) => progressToSize(slider / LOG_SLIDER_STEPS, minimum, maximum),
  };
}

export function LogRangeInput({ className, label, minimum, maximum, value, onChange }: {
  className?: string;
  label?: string;
  minimum: number;
  maximum: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const slider = logRangeInputProps(value, minimum, maximum);
  return <input
    className={className}
    style={slider.style}
    aria-label={label}
    aria-valuetext={`${value} pixels`}
    type="range"
    min={slider.min}
    max={slider.max}
    value={slider.value}
    onChange={(event) => onChange(slider.toSize(Number(event.target.value)))}
  />;
}

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

export function VerticalRange({ label, minimum, maximum, value, onChange, scale = 'linear' }: {
  label: string;
  minimum: number;
  maximum: number;
  value: number;
  onChange: (value: number) => void;
  scale?: 'linear' | 'log';
}) {
  const slider = scale === 'log' ? logRangeInputProps(value, minimum, maximum) : null;
  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onChange(rangeFromProgress(progress, minimum, maximum, scale));
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
      style={slider?.style ?? rangeStyle(value, minimum, maximum)}
      aria-label={label}
      aria-valuetext={scale === 'log' ? `${value} pixels` : undefined}
      type="range"
      min={slider?.min ?? minimum}
      max={slider?.max ?? maximum}
      value={slider?.value ?? value}
      onChange={(event) => onChange(slider ? slider.toSize(Number(event.target.value)) : Number(event.target.value))}
    />
  </div>;
}
