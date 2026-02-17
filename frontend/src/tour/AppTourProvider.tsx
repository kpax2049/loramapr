import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode
} from 'react';
import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import './appTour.css';
import { buildCoreTourSteps, filterAvailableTourSteps } from './steps';

const TOUR_SEEN_KEY = 'loramaprTourSeen:v1';

type AppTourContextValue = {
  startTour: (steps?: DriveStep[]) => void;
  hasSeenTour: boolean;
  resetTourSeen: () => void;
};

const AppTourContext = createContext<AppTourContextValue | null>(null);

function readTourSeen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(TOUR_SEEN_KEY) === 'true';
}

function writeTourSeen(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(TOUR_SEEN_KEY, value ? 'true' : 'false');
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
  const hasSeenTour = useMemo(() => readTourSeen(), []);
  const driverRef = useRef<Driver | null>(null);

  const startTour = useCallback((steps?: DriveStep[]) => {
    const requestedSteps = steps ?? buildCoreTourSteps();
    const tourSteps = filterAvailableTourSteps(requestedSteps);
    if (tourSteps.length === 0) {
      return;
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
        ensureSkipButton(popover, options.driver);
      }
    });

    driverInstance.setSteps(tourSteps);
    driverRef.current = driverInstance;
    driverInstance.drive();
    writeTourSeen(true);
  }, []);

  const resetTourSeen = useCallback(() => {
    writeTourSeen(false);
  }, []);

  const value = useMemo<AppTourContextValue>(
    () => ({
      startTour,
      hasSeenTour,
      resetTourSeen
    }),
    [startTour, hasSeenTour, resetTourSeen]
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
