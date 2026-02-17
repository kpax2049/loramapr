import type { Alignment, DriveStep, Side } from 'driver.js';

type CoreTourStepSpec = {
  selector: string;
  title: string;
  description: string;
  side?: Side;
  align?: Alignment;
  when?: () => boolean;
};

const CORE_TOUR_STEPS: CoreTourStepSpec[] = [
  {
    selector: '[data-tour="sidebar-tabs"]',
    title: 'Sidebar tabs',
    description:
      'Use these tabs to switch between Device, Sessions, Playback, and Coverage. Each tab shows controls for that area.',
    side: 'right',
    align: 'start'
  },
  {
    selector: '[data-tour="device-list"]',
    title: 'Device selector',
    description:
      'Choose the active device here. Device status and latest details update from this selection.',
    side: 'right',
    align: 'start'
  },
  {
    selector: '[data-tour="start-session"]',
    title: 'Start session',
    description:
      'Use Start session to begin recording for the selected device. After selecting a session, use Export GeoJSON to download it when available.',
    side: 'right',
    align: 'start'
  },
  {
    selector: '[data-tour="map"]',
    title: 'Map area',
    description:
      'The map shows measurements, tracks, and device markers. Click a point or marker to see details.',
    side: 'left',
    align: 'start'
  },
  {
    selector: '[data-tour="fit-to-data"]',
    title: 'Fit to Data',
    description: 'Use Fit to Data to re-center the map on the data currently shown.',
    side: 'bottom',
    align: 'start'
  },
  {
    selector: '[data-tour="playback-controls"]',
    title: 'Playback controls',
    description: 'In Playback, use Play, speed, window, and the scrubber to move through time.',
    side: 'left',
    align: 'start',
    when: () => Boolean(document.querySelector('[data-tour="playback-controls"]'))
  },
  {
    selector: '[data-tour="coverage-toggle"]',
    title: 'Coverage layer',
    description:
      'Switch between Points and Coverage to compare raw data and coverage summaries. Coverage metrics can be changed when this view is active.',
    side: 'left',
    align: 'start',
    when: () => Boolean(document.querySelector('[data-tour="coverage-toggle"]'))
  }
];

function stepTargetExists(step: DriveStep): boolean {
  if (!step.element) {
    return true;
  }
  if (typeof step.element === 'string') {
    return document.querySelector(step.element) !== null;
  }
  if (typeof step.element === 'function') {
    return Boolean(step.element());
  }
  return true;
}

export function filterAvailableTourSteps(steps: DriveStep[]): DriveStep[] {
  if (typeof document === 'undefined') {
    return [];
  }
  return steps.filter(stepTargetExists);
}

export function buildCoreTourSteps(): DriveStep[] {
  if (typeof document === 'undefined') {
    return [];
  }

  return CORE_TOUR_STEPS.flatMap((step) => {
    if (step.when && !step.when()) {
      return [];
    }
    if (!document.querySelector(step.selector)) {
      return [];
    }
    return [
      {
        element: step.selector,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align
        }
      }
    ];
  });
}
