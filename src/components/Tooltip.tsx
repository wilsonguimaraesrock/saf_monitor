'use client';

import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ text, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<'top' | 'bottom'>('top');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos(rect.top < 120 ? 'bottom' : 'top');
  }, [visible]);

  return (
    <div
      ref={ref}
      className={clsx('relative', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={clsx(
            'absolute z-50 left-1/2 -translate-x-1/2 w-56 px-3 py-2 rounded-lg text-xs leading-snug pointer-events-none',
            'bg-slate-800 text-slate-100 shadow-xl border border-slate-700',
            pos === 'top'
              ? 'bottom-full mb-2'
              : 'top-full mt-2'
          )}
        >
          {text}
          <span
            className={clsx(
              'absolute left-1/2 -translate-x-1/2 border-4 border-transparent',
              pos === 'top'
                ? 'top-full border-t-slate-800'
                : 'bottom-full border-b-slate-800'
            )}
          />
        </div>
      )}
    </div>
  );
}
