import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import './appTour.css';
import {
  buildCoreTourPlan,
  filterAvailableTourSteps,
  TOUR_JUMP_SECTIONS,
  TOUR_SECTION_LABELS,
  type TourSectionKey
} from './steps';

const LEGACY_TOUR_SEEN_KEY = 'loramaprTourSeen:v1';
const TOUR_COMPLETED_KEY = 'tourCompleted';
const TOUR_PROMPT_DISMISSED_KEY = 'tourPromptDismissed';

type AppTourContextValue = {
  startTour: (steps?: DriveStep[]) => void;
  tourCompleted: boolean;
  hasSeenTour: boolean;
  isTourActive: boolean;
  isTourPromptVisible: boolean;
  dismissTourPrompt: () => void;
  resetTour: () => void;
  resetTourSeen: () => void;
};

const AppTourContext = createContext<AppTourContextValue | null>(null);

function readLegacyTourSeen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(LEGACY_TOUR_SEEN_KEY) === 'true';
}

function readTourCompleted(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const current = window.localStorage.getItem(TOUR_COMPLETED_KEY);
  if (current === '1') {
    return true;
  }
  return readLegacyTourSeen();
}

function writeTourCompleted(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (value) {
    window.localStorage.setItem(TOUR_COMPLETED_KEY, '1');
  } else {
    window.localStorage.removeItem(TOUR_COMPLETED_KEY);
  }
}

function readTourPromptDismissed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(TOUR_PROMPT_DISMISSED_KEY) === '1';
}

function writeTourPromptDismissed(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (value) {
    window.localStorage.setItem(TOUR_PROMPT_DISMISSED_KEY, '1');
  } else {
    window.localStorage.removeItem(TOUR_PROMPT_DISMISSED_KEY);
  }
}

function clearLegacyTourSeen(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(LEGACY_TOUR_SEEN_KEY);
}

function ensureSkipButton(popover: PopoverDOM, driverInstance: Driver): void {
  const existingButton = popover.footerButtons.querySelector<HTMLButtonElement>('.lm-tour-skip-btn');
  if (existingButton) {
    existingButton.onclick = () => driverInstance.destroy();
    return;
  }

  const skipButton = document.createElement('button');
  skipButton.type = 'button';
  skipButton.className = 'driver-popover-btn lm-tour-skip-btn';
  skipButton.textContent = 'Skip';
  skipButton.setAttribute('aria-label', 'Skip guided tour');
  skipButton.onclick = () => driverInstance.destroy();
  popover.footerButtons.prepend(skipButton);
}

function ensureSectionJumpControl(
  popover: PopoverDOM,
  driverInstance: Driver,
  sectionStartIndexes: Partial<Record<TourSectionKey, number>>,
  stepSections: TourSectionKey[]
): void {
  const availableSections = TOUR_JUMP_SECTIONS.flatMap((section) => {
    const index = sectionStartIndexes[section];
    if (typeof index !== 'number' || index < 0) {
      return [];
    }
    return [{ section, index }];
  });

  const existing = popover.footer.querySelector<HTMLDivElement>('.lm-tour-section-jump');
  if (availableSections.length < 2) {
    existing?.remove();
    return;
  }

  const wrapper = existing ?? document.createElement('div');
  wrapper.className = 'lm-tour-section-jump';

  let label = wrapper.querySelector<HTMLLabelElement>('.lm-tour-section-jump__label');
  let select = wrapper.querySelector<HTMLSelectElement>('.lm-tour-section-jump__select');
  if (!label || !select) {
    wrapper.innerHTML = '';
    label = document.createElement('label');
    label.className = 'lm-tour-section-jump__label';
    label.textContent = 'Jump to section';

    select = document.createElement('select');
    select.className = 'lm-tour-section-jump__select';
    select.setAttribute('aria-label', 'Jump to tour section');

    wrapper.append(label, select);
  }

  const optionsMarkup = availableSections
    .map((entry) => {
      const labelText = TOUR_SECTION_LABELS[entry.section];
      return `<option value="${entry.section}">${labelText}</option>`;
    })
    .join('');
  if (select.innerHTML !== optionsMarkup) {
    select.innerHTML = optionsMarkup;
  }

  const activeIndex = driverInstance.getActiveIndex() ?? 0;
  const activeSection = stepSections[activeIndex];
  if (activeSection) {
    select.value = activeSection;
  }

  select.onchange = () => {
    const key = select?.value as TourSectionKey;
    const nextIndex = sectionStartIndexes[key];
    if (typeof nextIndex === 'number') {
      driverInstance.moveTo(nextIndex);
    }
  };

  if (!existing) {
    popover.footer.prepend(wrapper);
  }
}

function setHelpPopoverOpen(open: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.tourSetHelpPopoverOpen?.(open);
}

function readHelpPopoverOpen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.tourGetHelpPopoverOpen?.() ?? false;
}

export function AppTourProvider({ children }: { children: ReactNode }) {
  const [tourCompleted, setTourCompleted] = useState<boolean>(() => readTourCompleted());
  const [tourPromptDismissed, setTourPromptDismissed] = useState<boolean>(() =>
    readTourPromptDismissed()
  );
  const [isTourActive, setIsTourActive] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const sectionStartIndexesRef = useRef<Partial<Record<TourSectionKey, number>>>({});
  const stepSectionsRef = useRef<TourSectionKey[]>([]);
  const activeSectionRef = useRef<TourSectionKey | null>(null);
  const shortcutsPopoverPreviousOpenRef = useRef<boolean | null>(null);

  const syncSectionSideEffects = useCallback((nextSection: TourSectionKey | null) => {
    const previousSection = activeSectionRef.current;
    if (previousSection === nextSection) {
      return;
    }

    if (previousSection !== 'shortcuts' && nextSection === 'shortcuts') {
      shortcutsPopoverPreviousOpenRef.current = readHelpPopoverOpen();
      setHelpPopoverOpen(true);
    } else if (previousSection === 'shortcuts' && nextSection !== 'shortcuts') {
      const restoreOpen = shortcutsPopoverPreviousOpenRef.current;
      setHelpPopoverOpen(restoreOpen ?? false);
      shortcutsPopoverPreviousOpenRef.current = null;
    }

    activeSectionRef.current = nextSection;
  }, []);

  const startTour = useCallback((steps?: DriveStep[]) => {
    let tourSteps: DriveStep[];
    if (steps) {
      sectionStartIndexesRef.current = {};
      stepSectionsRef.current = [];
      tourSteps = filterAvailableTourSteps(steps);
    } else {
      const plan = buildCoreTourPlan();
      sectionStartIndexesRef.current = plan.sectionStartIndexes;
      stepSectionsRef.current = plan.stepSections;
      tourSteps = plan.steps;
    }

    if (tourSteps.length === 0) {
      return;
    }
    activeSectionRef.current = null;
    shortcutsPopoverPreviousOpenRef.current = null;
    writeTourCompleted(true);
    writeTourPromptDismissed(true);
    setTourCompleted(true);
    setTourPromptDismissed(true);
    if (driverRef.current) {
      driverRef.current.destroy();
      driverRef.current = null;
    }
    const driverInstance = driver({
      animate: true,
      allowClose: true,
      allowKeyboardControl: true,
      overlayClickBehavior: 'close',
      showButtons: ['previous', 'next', 'close'],
      showProgress: true,
      prevBtnText: 'Back',
      nextBtnText: 'Next',
      doneBtnText: 'Done',
      onPopoverRender: (popover, options) => {
        const activeIndex = options.driver.getActiveIndex();
        const activeSection =
          typeof activeIndex === 'number' ? stepSectionsRef.current[activeIndex] ?? null : null;
        syncSectionSideEffects(activeSection);
        ensureSkipButton(popover, options.driver);
        ensureSectionJumpControl(
          popover,
          options.driver,
          sectionStartIndexesRef.current,
          stepSectionsRef.current
        );
      },
      onDestroyed: () => {
        syncSectionSideEffects(null);
        setIsTourActive(false);
        if (driverRef.current === driverInstance) {
          driverRef.current = null;
        }
      }
    });

    driverInstance.setSteps(tourSteps);
    driverRef.current = driverInstance;
    setIsTourActive(true);
    driverInstance.drive();
  }, [syncSectionSideEffects]);

  const dismissTourPrompt = useCallback(() => {
    writeTourPromptDismissed(true);
    setTourPromptDismissed(true);
  }, []);

  const resetTour = useCallback(() => {
    writeTourCompleted(false);
    writeTourPromptDismissed(false);
    clearLegacyTourSeen();
    setTourCompleted(false);
    setTourPromptDismissed(false);
  }, []);

  const isTourPromptVisible = !tourCompleted && !tourPromptDismissed;

  const value = useMemo<AppTourContextValue>(
    () => ({
      startTour,
      tourCompleted,
      hasSeenTour: tourCompleted,
      isTourActive,
      isTourPromptVisible,
      dismissTourPrompt,
      resetTour,
      resetTourSeen: resetTour
    }),
    [
      startTour,
      tourCompleted,
      isTourActive,
      isTourPromptVisible,
      dismissTourPrompt,
      resetTour
    ]
  );

  return <AppTourContext.Provider value={value}>{children}</AppTourContext.Provider>;
}

export function useAppTour(): AppTourContextValue {
  const context = useContext(AppTourContext);
  if (!context) {
    throw new Error('useAppTour must be used within AppTourProvider');
  }
  return context;
}
