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
      'Use these tabs to switch between Device, Sessions, Playback, Coverage, and Debug controls.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'orientation-selected-device',
    section: 'orientation',
    selector: '[data-tour="selected-device-header"]',
    title: 'Selected device',
    content:
      'This header shows the active device identity and status, plus quick actions like Copy deviceUid.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'orientation-fit',
    section: 'orientation',
    selector: '[data-tour="fit-to-data"]',
    title: 'Fit to data',
    content:
      'Use Fit to data to recenter the map to whatever is currently visible in your active view.',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'orientation-map',
    section: 'orientation',
    selector: '[data-tour="map"]',
    title: 'Map',
    content:
      'The map shows measurements, tracks, coverage, and device markers. Click points or markers to inspect details.',
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
      'Choose which device is active. The rest of the app updates to that selection.',
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
      'This panel shows metadata, timestamps, and status for the selected device.',
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
      'The dot reflects measurement freshness and ingest activity. Hover it to see last-seen details.',
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
      'Use these controls to center on a device latest point and manage map marker visibility.',
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
      'This panel lists sessions for the selected device and supports selecting one for analysis.',
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
      'Start a new session here, then stop it when your run is complete.',
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
      'Review past sessions, select one, and compare start/end times before drilling into playback or exports.',
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
      'Session actions include rename, archive/unarchive, and safe delete when permissions allow it.',
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
      'Select a session and replay movement over time with play, pause, and window controls.',
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
      'Drag the scrubber to jump to a specific moment and inspect what was seen at that time.',
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
      'Adjust speed to review quickly or step through slowly when validating timelines.',
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
      'Switch between points and coverage to move from raw observations to aggregate spatial view.',
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
      'Choose which metric powers the coverage visualization, such as count, RSSI average, or SNR average.',
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
      'Use the legend to read bucket meaning and interpret color values on the map.',
    side: 'left',
    align: 'start'
  },

  // 6) Stats / Right panel
  {
    id: 'stats-right-panel',
    section: 'stats',
    selector: '[data-tour="right-panel"]',
    title: 'Point details and stats',
    content:
      'The right panel shows selected point details and session stats to validate what you see on the map.',
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
      'Use Z or this button to simplify layout and focus on the map.',
    side: 'bottom',
    align: 'end'
  },
  {
    id: 'shortcuts-help',
    section: 'shortcuts',
    selector: '[data-tour="tour-start-button"]',
    title: 'Tour and help',
    content:
      'Use this help menu anytime to restart the tour or reset onboarding state.',
    side: 'bottom',
    align: 'end'
  },

  // 8) Debug (optional)
  {
    id: 'debug-events',
    section: 'debug',
    selector: '[data-tour="debug-events"]',
    tab: 'debug',
    title: 'Debug events',
    content:
      'Debug panels show recent ingest events and processing results for troubleshooting.',
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
      'Use these stats panels to inspect receiver or gateway behavior in the current scope.',
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

