import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type HoverTooltipProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

type TooltipPosition = {
  left: number;
  top: number;
};

const TOOLTIP_MAX_WIDTH = 220;

export default function HoverTooltip({ label, children, className }: HoverTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = () => {
    if (!anchorRef.current || typeof window === 'undefined') {
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const margin = 10;
    const left = Math.min(
      window.innerWidth - margin,
      Math.max(margin, rect.left + rect.width / 2)
    );
    const top = Math.max(margin, rect.top - 8);
    setPosition({ left, top });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open]);

  return (
    <>
      <span
        ref={anchorRef}
        className={className ? `ui-tooltip-anchor ${className}` : 'ui-tooltip-anchor'}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <span
              className="ui-tooltip-bubble"
              role="tooltip"
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
                maxWidth: `${TOOLTIP_MAX_WIDTH}px`
              }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </>
  );
}
