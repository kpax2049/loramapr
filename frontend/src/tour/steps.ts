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
    description: 'Switch between Device, Sessions, Playback, and Coverage.',
    side: 'right',
    align: 'start'
  },
  {
    selector: '[data-tour="device-list"]',
    title: 'Device selector',
    description: 'Choose the active device from the selector/list.',
    side: 'right',
    align: 'start'
  },
  {
    selector: '[data-tour="start-session"]',
    title: 'Start session',
    description: 'Start a new capture session for the selected device.',
    side: 'right',
    align: 'start'
  },
  {
    selector: '[data-tour="map"]',
    title: 'Map area',
    description: 'Explore points, tracks, and device markers on the map.',
    side: 'left',
    align: 'start'
  },
  {
    selector: '[data-tour="fit-to-data"]',
    title: 'Fit to Data',
    description: 'Recenter and fit the map to the currently visible dataset.',
    side: 'bottom',
    align: 'start'
  },
  {
    selector: '[data-tour="playback-controls"]',
    title: 'Playback controls',
    description: 'Control replay speed, window size, and scrub through time.',
    side: 'left',
    align: 'start',
    when: () => Boolean(document.querySelector('[data-tour="playback-controls"]'))
  },
  {
    selector: '[data-tour="coverage-toggle"]',
    title: 'Coverage layer',
    description: 'Toggle points vs coverage view and explore coverage metrics.',
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

