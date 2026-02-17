import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';

const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const COLLAPSED_SIDEBAR_WIDTH = 56;
const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

type LayoutProps = {
  sidebarHeader?: ReactNode;
  sidebarFooter?: ReactNode;
  sidebarFooterCollapsed?: ReactNode;
  sidebarHeaderActions?: ReactNode;
  sidebarHeaderBottomActions?: ReactNode;
  sidebarCollapsedContent?: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  forceSidebarCollapsed?: boolean;
};

type ResizeStart = {
  startX: number;
  startWidth: number;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  return target.hasAttribute('contenteditable');
}

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function readStoredSidebarWidth(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
  if (!raw) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return clampSidebarWidth(parsed);
}

function readStoredSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return false;
}

export default function Layout({
  sidebarHeader,
  sidebarFooter,
  sidebarFooterCollapsed,
  sidebarHeaderActions,
  sidebarHeaderBottomActions,
  sidebarCollapsedContent,
  sidebar,
  children,
  forceSidebarCollapsed = false
}: LayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState<number>(readStoredSidebarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readStoredSidebarCollapsed);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<ResizeStart | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? 'true' : 'false');
  }, [sidebarCollapsed]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizeRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth
      };
      setIsResizing(true);
    },
    [sidebarWidth]
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeRef.current;
      if (!start) {
        return;
      }
      const nextWidth = clampSidebarWidth(start.startWidth + (event.clientX - start.startX));
      setSidebarWidth(nextWidth);
    };

    const stopResizing = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [isResizing]);

  const isSidebarCollapsed = forceSidebarCollapsed || sidebarCollapsed;
  const computedSidebarWidth = isSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === 'Escape') {
        if (forceSidebarCollapsed || isSidebarCollapsed) {
          return;
        }
        event.preventDefault();
        setSidebarCollapsed(true);
        return;
      }

      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'b'
      ) {
        if (forceSidebarCollapsed) {
          return;
        }
        event.preventDefault();
        setSidebarCollapsed((value) => !value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [forceSidebarCollapsed, isSidebarCollapsed]);

  return (
    <div className={`layout${isResizing ? ' layout--resizing' : ''}`}>
      <aside
        className={`layout__sidebar${isSidebarCollapsed ? ' layout__sidebar--collapsed' : ''}`}
        style={{ width: `${computedSidebarWidth}px` }}
      >
        <div
          className={`layout__sidebar-header${
            isSidebarCollapsed ? ' layout__sidebar-header--collapsed' : ''
          }`}
        >
          {!isSidebarCollapsed ? (
            <div className="layout__sidebar-header-content">{sidebarHeader}</div>
          ) : null}
        </div>
        <div className="layout__sidebar-body">
          {isSidebarCollapsed ? (
            <div className="layout__rail">
              {sidebarCollapsedContent}
            </div>
          ) : (
            <div className="layout__sidebar-content">{sidebar}</div>
          )}
        </div>
        <div className="layout__sidebar-footer">
          {isSidebarCollapsed ? (
            sidebarFooterCollapsed ?? (
              <span className="layout__sidebar-footer-meta">
                SB
              </span>
            )
          ) : sidebarFooter ? (
            sidebarFooter
          ) : (
            <span className="layout__sidebar-footer-meta">
              {`${Math.round(sidebarWidth)}px`}
            </span>
          )}
        </div>
        <div className="layout__sidebar-top-right">
          <div className="layout__sidebar-top-right-main">
            {sidebarHeaderActions ? (
              <div className="layout__sidebar-header-actions">{sidebarHeaderActions}</div>
            ) : null}
            <button
              type="button"
              className="layout__toggle-button"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              disabled={forceSidebarCollapsed}
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {isSidebarCollapsed ? '>' : '<'}
            </button>
          </div>
          {sidebarHeaderBottomActions ? (
            <div className="layout__sidebar-top-right-bottom">{sidebarHeaderBottomActions}</div>
          ) : null}
        </div>
        {!isSidebarCollapsed && (
          <div
            className="layout__resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={handleResizePointerDown}
          />
        )}
      </aside>
      <main className="layout__main">{children}</main>
    </div>
  );
}
