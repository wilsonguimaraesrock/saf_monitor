'use client';

import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

interface TipPosition {
  top?: number;
  bottom?: number;
  left: number;
  placement: 'top' | 'bottom';
}

export function Tooltip({ text, children, className }: TooltipProps) {
  const [tipPos, setTipPos] = useState<TipPosition | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const placement: 'top' | 'bottom' = spaceAbove < 120 ? 'bottom' : 'top';

    if (placement === 'top') {
      setTipPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left + rect.width / 2,
        placement: 'top',
      });
    } else {
      setTipPos({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
        placement: 'bottom',
      });
    }
  }, []);

  const hide = useCallback(() => setTipPos(null), []);

  const tooltip = tipPos
    ? createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: tipPos.top,
            bottom: tipPos.bottom,
            left: tipPos.left,
            transform: 'translateX(-50%)',
            zIndex: 9998,
            pointerEvents: 'none',
            maxWidth: '14rem',
          }}
          className="px-3 py-2 rounded-lg text-xs leading-snug bg-slate-800 text-slate-100 shadow-xl border border-slate-700"
        >
          {text}
          <span
            className={clsx(
              'absolute left-1/2 -translate-x-1/2 border-4 border-transparent',
              tipPos.placement === 'top'
                ? 'top-full border-t-slate-800'
                : 'bottom-full border-b-slate-800'
            )}
          />
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={ref}
      className={clsx('relative', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {tooltip}
    </div>
  );
}
