import type { Alignment, DriveStep, Side } from 'driver.js';

export type TourSidebarTabKey = 'device' | 'sessions' | 'playback' | 'coverage' | 'debug';
export type TourSectionKey =
  | 'orientation'
  | 'devices'
  | 'sessions'
  | 'playback'
  | 'coverage'
  | 'stats'
  | 'shortcuts'
  | 'debug';

type TourStepSpec = {
  id: string;
  section: TourSectionKey;
  title: string;
  content: string;
  selector: string;
  tab?: TourSidebarTabKey;
  side?: Side;
  align?: Alignment;
  condition?: () => boolean;
};

type TourPlan = {
  steps: DriveStep[];
  sectionStartIndexes: Partial<Record<TourSectionKey, number>>;
  stepSections: TourSectionKey[];
};

declare global {
  interface Window {
    tourSetActiveTab?: (tab: TourSidebarTabKey) => void;
    tourGetActiveTab?: () => TourSidebarTabKey | null;
    tourSetHelpPopoverOpen?: (open: boolean) => void;
    tourGetHelpPopoverOpen?: () => boolean;
    tourSetRightPanelExpanded?: (expanded: boolean) => void;
    tourGetRightPanelExpanded?: () => boolean;
  }
}

export const TOUR_SECTION_LABELS: Record<TourSectionKey, string> = {
  orientation: 'Orientation',
  devices: 'Devices',
  sessions: 'Sessions',
  playback: 'Playback',
  coverage: 'Coverage',
  stats: 'Stats',
  shortcuts: 'Shortcuts',
  debug: 'Debug'
};

export const TOUR_JUMP_SECTIONS: TourSectionKey[] = [
  'orientation',
  'devices',
  'sessions',
  'playback',
  'coverage',
  'shortcuts'
];

const TOUR_STEPS: TourStepSpec[] = [
  // 1) Orientation
  {
    id: 'orientation-tabs',
    section: 'orientation',
    selector: '[data-tour="sidebar-tabs"]',
    title: 'Sidebar tabs',
    content:
      'Switch between Device, Sessions, Playback, Coverage, and Debug views here.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'orientation-selected-device',
    section: 'orientation',
    selector: '[data-tour="selected-device-header"]',
    title: 'Selected device',
    content:
      'Shows the selected device identity, online status, and quick actions like Copy deviceUid.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'orientation-fit',
    section: 'orientation',
    selector: '[data-tour="fit-to-data"]',
    title: 'Fit to data',
    content:
      'Recenter the map to the currently visible dataset in explore, playback, or coverage views.',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'orientation-map',
    section: 'orientation',
    selector: '[data-tour="map"]',
    title: 'Map',
    content:
      'This is the main map canvas for points, tracks, coverage bins, and device markers. Click a point or marker for details.',
    side: 'left',
    align: 'start'
  },

  // 2) Devices
  {
    id: 'devices-picker',
    section: 'devices',
    selector: '[data-tour="device-picker"]',
    tab: 'device',
    title: 'Device picker',
    content:
      'Select the active device used across all tabs.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'devices-details',
    section: 'devices',
    selector: '[data-tour="device-details"]',
    tab: 'device',
    title: 'Device details',
    content:
      'Review metadata, status, timestamps, and latest location for the selected device.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'devices-online-dot',
    section: 'devices',
    selector: '[data-tour="device-online-dot"]',
    tab: 'device',
    title: 'Device status dot',
    content:
      'Dot color reflects measurement recency, and the ring shows ingest recency when it is newer. Hover for last-seen details.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'devices-latest-location',
    section: 'devices',
    selector: '[data-tour="device-latest-location"]',
    tab: 'device',
    title: 'Latest location actions',
    content:
      'Center on the latest known location and toggle device markers on the map.',
    side: 'right',
    align: 'start'
  },

  // 3) Sessions
  {
    id: 'sessions-picker',
    section: 'sessions',
    selector: '[data-tour="session-picker"]',
    tab: 'sessions',
    title: 'Sessions panel',
    content:
      'Manage recording sessions for the selected device.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'sessions-start-stop',
    section: 'sessions',
    selector: '[data-tour="session-start-stop"]',
    tab: 'sessions',
    title: 'Start and stop session',
    content:
      'Start a session before a run and stop it when finished.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'sessions-list',
    section: 'sessions',
    selector: '[data-tour="session-list"]',
    tab: 'sessions',
    title: 'Session list',
    content:
      'Select past sessions for analysis and export.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'sessions-actions',
    section: 'sessions',
    selector: '[data-tour="session-actions"]',
    tab: 'sessions',
    title: 'Session actions',
    content:
      'Rename, archive, unarchive, or safely delete sessions when QUERY access is available.',
    side: 'right',
    align: 'start',
    condition: () => Boolean(document.querySelector('[data-tour="session-actions"]'))
  },

  // 4) Playback
  {
    id: 'playback-controls',
    section: 'playback',
    selector: '[data-tour="playback-controls"]',
    tab: 'playback',
    title: 'Playback controls',
    content:
      'Replay a selected session timeline with play/pause, speed, and window controls.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'playback-scrubber',
    section: 'playback',
    selector: '[data-tour="playback-scrubber"]',
    tab: 'playback',
    title: 'Playback scrubber',
    content:
      'Drag the scrubber to inspect any timestamp in the selected session.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'playback-speed',
    section: 'playback',
    selector: '[data-tour="playback-speed"]',
    tab: 'playback',
    title: 'Playback speed',
    content:
      'Change replay speed from slow review to fast scan.',
    side: 'left',
    align: 'start'
  },

  // 5) Coverage
  {
    id: 'coverage-toggle',
    section: 'coverage',
    selector: '[data-tour="coverage-toggle"]',
    tab: 'coverage',
    title: 'Coverage toggle',
    content:
      'Toggle between raw points and aggregated coverage.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'coverage-metric',
    section: 'coverage',
    selector: '[data-tour="coverage-metric"]',
    tab: 'coverage',
    title: 'Coverage metric',
    content:
      'Choose the metric used to color coverage bins.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'coverage-legend',
    section: 'coverage',
    selector: '[data-tour="coverage-legend"]',
    tab: 'coverage',
    title: 'Coverage legend',
    content:
      'Read the current color buckets for the selected coverage metric.',
    side: 'left',
    align: 'start'
  },

  // 6) Stats / Right panel
  {
    id: 'stats-overview',
    section: 'stats',
    selector: '[data-tour="right-panel"]',
    title: 'Stats overview',
    content:
      'Point Details and Stats summarize the active map selection and filtered dataset.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'stats-compare',
    section: 'stats',
    selector: '[data-tour="gateway-receiver-compare"]',
    tab: 'coverage',
    title: 'Gateway/Receiver compare',
    content:
      'Compare controls filter by gateway or receiver and support side-by-side analysis.',
    side: 'left',
    align: 'start'
  },

  // 7) Shortcuts
  {
    id: 'shortcuts-zen',
    section: 'shortcuts',
    selector: '[data-tour="zen-mode"]',
    title: 'Zen mode',
    content:
      'Toggle Zen mode here, or press Z.',
    side: 'bottom',
    align: 'end'
  },
  {
    id: 'shortcuts-help',
    section: 'shortcuts',
    selector: '[data-tour="shortcuts-help"]',
    title: 'Keyboard shortcuts',
    content:
      'This panel lists available keyboard shortcuts for sidebar and playback navigation.',
    side: 'left',
    align: 'start'
  },

  // 8) Debug (optional)
  {
    id: 'debug-events',
    section: 'debug',
    selector: '[data-tour="debug-events"]',
    tab: 'debug',
    title: 'Debug events',
    content:
      'Inspect recent ingest events and processing errors for troubleshooting.',
    side: 'left',
    align: 'start',
    condition: () => Boolean(document.querySelector('[data-tour="debug-events"]'))
  },
  {
    id: 'debug-gateways',
    section: 'debug',
    selector: '[data-tour="debug-gateways"]',
    tab: 'debug',
    title: 'Receiver and gateway stats',
    content:
      'Gateway and receiver stats help validate source behavior in the current scope.',
    side: 'left',
    align: 'start',
    condition: () => Boolean(document.querySelector('[data-tour="debug-gateways"]'))
  }
];

function setActiveTab(tab: TourSidebarTabKey | undefined): void {
  if (!tab || typeof window === 'undefined') {
    return;
  }
  window.tourSetActiveTab?.(tab);
}

function setHelpPopoverOpen(open: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.tourSetHelpPopoverOpen?.(open);
}

function setRightPanelExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.tourSetRightPanelExpanded?.(expanded);
}

function isElementVisible(element: Element): boolean {
  if ('offsetParent' in element) {
    return (element as HTMLElement).offsetParent !== null;
  }
  return true;
}

function resolveStepTarget(step: TourStepSpec): Element | null {
  if (typeof document === 'undefined') {
    return null;
  }
  setActiveTab(step.tab);
  if (step.section === 'shortcuts') {
    setHelpPopoverOpen(true);
  }
  if (step.section === 'stats') {
    setRightPanelExpanded(true);
  }
  const target = document.querySelector(step.selector);
  if (!target) {
    return null;
  }
  if (!isElementVisible(target)) {
    return null;
  }
  return target;
}

function shouldIncludeStep(step: TourStepSpec): boolean {
  if (step.condition && !step.condition()) {
    return false;
  }
  return resolveStepTarget(step) !== null;
}

function buildDriveStep(step: TourStepSpec): DriveStep {
  return {
    element: () => resolveStepTarget(step) ?? document.body,
    onHighlightStarted: (_element, _driveStep, opts) => {
      const target = resolveStepTarget(step);
      if (target) {
        return;
      }
      if (opts.driver.hasNextStep()) {
        opts.driver.moveNext();
        return;
      }
      opts.driver.destroy();
    },
    popover: {
      title: step.title,
      description: step.content,
      side: step.side,
      align: step.align
    }
  };
}

export function buildCoreTourPlan(): TourPlan {
  if (typeof document === 'undefined') {
    return { steps: [], sectionStartIndexes: {}, stepSections: [] };
  }

  const previousTab = window.tourGetActiveTab?.() ?? null;
  const previousHelpPopoverOpen = window.tourGetHelpPopoverOpen?.() ?? null;
  const previousRightPanelExpanded = window.tourGetRightPanelExpanded?.() ?? null;
  const steps: DriveStep[] = [];
  const stepSections: TourSectionKey[] = [];
  const sectionStartIndexes: Partial<Record<TourSectionKey, number>> = {};

  for (const step of TOUR_STEPS) {
    if (!shouldIncludeStep(step)) {
      continue;
    }
    if (sectionStartIndexes[step.section] === undefined) {
      sectionStartIndexes[step.section] = steps.length;
    }
    steps.push(buildDriveStep(step));
    stepSections.push(step.section);
  }

  if (previousTab) {
    setActiveTab(previousTab);
  }
  if (typeof previousHelpPopoverOpen === 'boolean') {
    setHelpPopoverOpen(previousHelpPopoverOpen);
  }
  if (typeof previousRightPanelExpanded === 'boolean') {
    setRightPanelExpanded(previousRightPanelExpanded);
  }

  return { steps, sectionStartIndexes, stepSections };
}

function resolveStepElement(step: DriveStep): Element | null {
  if (!step.element) {
    return document.body;
  }
  if (typeof step.element === 'string') {
    const target = document.querySelector(step.element);
    if (!target) {
      return null;
    }
    return isElementVisible(target) ? target : null;
  }
  if (typeof step.element === 'function') {
    const target = step.element();
    if (!target) {
      return null;
    }
    return isElementVisible(target) ? target : null;
  }
  return isElementVisible(step.element) ? step.element : null;
}

export function filterAvailableTourSteps(steps: DriveStep[]): DriveStep[] {
  if (typeof document === 'undefined') {
    return [];
  }
  return steps.filter((step) => resolveStepElement(step) !== null);
}

export function buildCoreTourSteps(): DriveStep[] {
  return buildCoreTourPlan().steps;
}
