import type { Alignment, DriveStep, Side } from 'driver.js';

export type TourSidebarTabKey = 'device' | 'sessions' | 'playback' | 'coverage' | 'debug';
export type TourFilterModeKey = 'time' | 'session';
export type TourViewModeKey = 'explore' | 'playback';
export type TourMapLayerModeKey = 'points' | 'coverage';
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
  filterMode?: TourFilterModeKey;
  viewMode?: TourViewModeKey;
  mapLayerMode?: TourMapLayerModeKey;
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
    tourSetFilterMode?: (mode: TourFilterModeKey) => void;
    tourGetFilterMode?: () => TourFilterModeKey | null;
    tourSetViewMode?: (mode: TourViewModeKey) => void;
    tourGetViewMode?: () => TourViewModeKey | null;
    tourSetMapLayerMode?: (mode: TourMapLayerModeKey) => void;
    tourGetMapLayerMode?: () => TourMapLayerModeKey | null;
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
      'Shows the selected device identity, status, and quick actions like copy device UID and fit to data.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'orientation-status-strip',
    section: 'orientation',
    selector: '[data-tour="status-strip"]',
    title: 'Status strip',
    content:
      'Use this strip to confirm active device, recent measurement/ingest activity, and current session at a glance.',
    side: 'top',
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
      'This map is where you validate coverage around your home/base setup using field-test points, tracks, and overlays.',
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
    id: 'devices-manager',
    section: 'devices',
    selector: '[data-tour="devices-manager"]',
    tab: 'device',
    title: 'Device manager',
    content:
      'Search, sort, and manage your device list here, including archive/edit actions and quick access to auto-session config.',
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
      'Center on the latest known location and toggle device markers while validating field-test routes.',
    side: 'right',
    align: 'start'
  },

  // 3) Sessions
  {
    id: 'sessions-picker',
    section: 'sessions',
    selector: '[data-tour="session-picker"]',
    tab: 'sessions',
    filterMode: 'session',
    viewMode: 'explore',
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
    filterMode: 'session',
    viewMode: 'explore',
    title: 'Start and stop session',
    content:
      'Start a session before leaving your home/base area and stop it when the run is complete.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'sessions-list',
    section: 'sessions',
    selector: '[data-tour="session-list"]',
    tab: 'sessions',
    filterMode: 'session',
    viewMode: 'explore',
    title: 'Session list',
    content:
      'Pick past runs to inspect stats, fit the map to that run, and export GeoJSON.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'sessions-compare',
    section: 'sessions',
    selector: '[data-tour="session-compare-bar"]',
    tab: 'sessions',
    filterMode: 'session',
    viewMode: 'explore',
    title: 'Session comparison',
    content:
      'Select multiple runs and open compare mode to review range and edge-signal results side by side.',
    side: 'right',
    align: 'start',
    condition: () => Boolean(document.querySelector('[data-tour="session-compare-bar"]'))
  },

  // 4) Playback
  {
    id: 'playback-controls',
    section: 'playback',
    selector: '[data-tour="playback-controls"]',
    tab: 'playback',
    viewMode: 'playback',
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
    viewMode: 'playback',
    title: 'Playback scrubber',
    content:
      'Drag the scrubber to inspect any timestamp in the selected session.',
    side: 'left',
    align: 'start'
  },

  // 5) Coverage
  {
    id: 'coverage-toggle',
    section: 'coverage',
    selector: '[data-tour="coverage-toggle"]',
    tab: 'coverage',
    viewMode: 'explore',
    title: 'Coverage toggle',
    content:
      'Use Points for raw path review, then switch to Coverage to see aggregated range patterns.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'coverage-metric',
    section: 'coverage',
    selector: '[data-tour="coverage-metric"]',
    tab: 'coverage',
    viewMode: 'explore',
    mapLayerMode: 'coverage',
    title: 'Coverage metric',
    content:
      'Set scope (device/session), choose bins or heatmap, and pick the metric used for coloring.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'coverage-legend',
    section: 'coverage',
    selector: '[data-tour="coverage-legend"]',
    tab: 'coverage',
    viewMode: 'explore',
    mapLayerMode: 'coverage',
    title: 'Coverage legend',
    content:
      'Read the current color buckets for the selected coverage metric.',
    side: 'left',
    align: 'start'
  },
  {
    id: 'coverage-compare',
    section: 'coverage',
    selector: '[data-tour="gateway-receiver-compare"]',
    tab: 'coverage',
    viewMode: 'explore',
    title: 'Receiver/gateway analysis',
    content:
      'Filter and compare gateways or receivers to isolate path quality differences in your test area.',
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
      'Point Details and Stats summarize the selected point and the currently filtered dataset.',
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
      'This help menu lists shortcuts and gives you Start tour / Reset tour controls any time.',
    side: 'left',
    align: 'start'
  },

  // 8) Debug (optional)
  {
    id: 'debug-events-explorer',
    section: 'debug',
    selector: '[data-tour="events-explorer"]',
    tab: 'debug',
    title: 'Events explorer',
    content:
      'Filter raw ingest events, inspect payload details, and recover a session from selected events when needed.',
    side: 'left',
    align: 'start',
    condition: () => Boolean(document.querySelector('[data-tour="events-explorer"]'))
  },
  {
    id: 'debug-events',
    section: 'debug',
    selector: '[data-tour="debug-events"]',
    tab: 'debug',
    title: 'Live ingest panels',
    content:
      'Use these live event streams for quick troubleshooting of recent ingest and decode issues.',
    side: 'left',
    align: 'start',
    condition: () => Boolean(document.querySelector('[data-tour="debug-events"]'))
  }
];

function setActiveTab(tab: TourSidebarTabKey | undefined): void {
  if (!tab || typeof window === 'undefined') {
    return;
  }
  window.tourSetActiveTab?.(tab);
}

function setFilterMode(mode: TourFilterModeKey | undefined): void {
  if (!mode || typeof window === 'undefined') {
    return;
  }
  window.tourSetFilterMode?.(mode);
}

function setViewMode(mode: TourViewModeKey | undefined): void {
  if (!mode || typeof window === 'undefined') {
    return;
  }
  window.tourSetViewMode?.(mode);
}

function setMapLayerMode(mode: TourMapLayerModeKey | undefined): void {
  if (!mode || typeof window === 'undefined') {
    return;
  }
  window.tourSetMapLayerMode?.(mode);
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
  setFilterMode(step.filterMode);
  setViewMode(step.viewMode);
  setMapLayerMode(step.mapLayerMode);
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
  const target = resolveStepTarget(step);
  if (!target) {
    return false;
  }
  if (step.condition && !step.condition()) {
    return false;
  }
  return true;
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
  const previousFilterMode = window.tourGetFilterMode?.() ?? null;
  const previousViewMode = window.tourGetViewMode?.() ?? null;
  const previousMapLayerMode = window.tourGetMapLayerMode?.() ?? null;
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
  if (previousFilterMode) {
    setFilterMode(previousFilterMode);
  }
  if (previousViewMode) {
    setViewMode(previousViewMode);
  }
  if (previousMapLayerMode) {
    setMapLayerMode(previousMapLayerMode);
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
