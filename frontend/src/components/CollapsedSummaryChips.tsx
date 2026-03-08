import { type ReactNode, useEffect, useMemo, useState } from 'react';

export type CollapsedSummaryChipTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

export type CollapsedSummaryChipItem = {
  key: string;
  priority: number;
  icon: ReactNode;
  text: string;
  tone?: CollapsedSummaryChipTone;
  title?: string;
};

type CollapsedSummaryChipsProps = {
  items: CollapsedSummaryChipItem[];
};

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

export default function CollapsedSummaryChips({ items }: CollapsedSummaryChipsProps) {
  const isNarrow = useMediaQuery('(max-width: 420px)');
  const maxItems = isNarrow ? 2 : 4;

  const visibleItems = useMemo(() => {
    return [...items]
      .filter((item) => item.text.trim().length > 0)
      .sort((left, right) => left.priority - right.priority)
      .slice(0, maxItems);
  }, [items, maxItems]);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="collapsed-summary-chips" aria-label="Collapsed summary">
      {visibleItems.map((item) => (
        <span
          key={item.key}
          className={`collapsed-summary-chips__item chip--${item.tone ?? 'neutral'}${
            item.priority === 1 ? ' collapsed-summary-chips__item--top' : ''
          }`}
          title={item.title ?? item.text}
        >
          <span className="collapsed-summary-chips__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="collapsed-summary-chips__text">{item.text}</span>
        </span>
      ))}
    </div>
  );
}
