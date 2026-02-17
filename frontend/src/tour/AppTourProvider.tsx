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
import { buildCoreTourSteps, filterAvailableTourSteps } from './steps';

const LEGACY_TOUR_SEEN_KEY = 'loramaprTourSeen:v1';
const TOUR_COMPLETED_KEY = 'tourCompleted';
const TOUR_PROMPT_DISMISSED_KEY = 'tourPromptDismissed';

type AppTourContextValue = {
  startTour: (steps?: DriveStep[]) => void;
  tourCompleted: boolean;
  hasSeenTour: boolean;
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

export function AppTourProvider({ children }: { children: ReactNode }) {
  const [tourCompleted, setTourCompleted] = useState<boolean>(() => readTourCompleted());
  const [tourPromptDismissed, setTourPromptDismissed] = useState<boolean>(() =>
    readTourPromptDismissed()
  );
  const driverRef = useRef<Driver | null>(null);

  const startTour = useCallback((steps?: DriveStep[]) => {
    const requestedSteps = steps ?? buildCoreTourSteps();
    const tourSteps = filterAvailableTourSteps(requestedSteps);
    if (tourSteps.length === 0) {
      return;
    }
    writeTourCompleted(true);
    writeTourPromptDismissed(true);
    setTourCompleted(true);
    setTourPromptDismissed(true);
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
        ensureSkipButton(popover, options.driver);
      }
    });

    driverInstance.setSteps(tourSteps);
    driverRef.current = driverInstance;
    driverInstance.drive();
  }, []);

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
      isTourPromptVisible,
      dismissTourPrompt,
      resetTour,
      resetTourSeen: resetTour
    }),
    [
      startTour,
      tourCompleted,
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
