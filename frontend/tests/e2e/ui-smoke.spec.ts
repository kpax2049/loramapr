import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve('tests/e2e/screenshots');
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 }
] as const;

function screenshotPath(name: string): string {
  return path.join(SCREENSHOT_DIR, name);
}

async function captureScreenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.screenshot({
    path: screenshotPath(name),
    fullPage: true
  });
}

async function prepareDeterministicState(
  page: Page
): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('sidebarCollapsed', 'false');
    window.localStorage.setItem('sidebarWidth', '320');
    window.localStorage.setItem('zenMode', 'false');
  });
}

test('ui smoke screenshots', async ({ page }, testInfo) => {
  const notes: string[] = [];
  await fs.rm(SCREENSHOT_DIR, { recursive: true, force: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  await prepareDeterministicState(page);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });

  let tookCollapsedShot = false;

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(150);

    await captureScreenshot(page, `ui-${viewport.width}x${viewport.height}-default.png`);

    if (!tookCollapsedShot) {
      const sidebarToggle = page
        .getByRole('button', { name: /collapse sidebar|expand sidebar/i })
        .first();
      const hasToggle = (await sidebarToggle.count()) > 0 && (await sidebarToggle.isVisible());

      if (!hasToggle) {
        const note = 'Sidebar toggle not found; skipped collapsed-state screenshot.';
        notes.push(note);
        console.log(`[ui-smoke] ${note}`);
      } else {
        await sidebarToggle.click();
        await page.waitForTimeout(150);
        await captureScreenshot(
          page,
          `ui-${viewport.width}x${viewport.height}-collapsed.png`
        );
        tookCollapsedShot = true;

        const expandToggle = page.getByRole('button', { name: /expand sidebar/i }).first();
        if ((await expandToggle.count()) > 0 && (await expandToggle.isVisible())) {
          await expandToggle.click();
          await page.waitForTimeout(100);
        } else {
          const note =
            'Sidebar was collapsed for screenshot but could not locate expand toggle to restore state.';
          notes.push(note);
          console.log(`[ui-smoke] ${note}`);
        }
      }
    }
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  const scrollTarget = await page.evaluate(() => {
    const sidebarBody = document.querySelector('.layout__sidebar-body');
    if (sidebarBody instanceof HTMLElement && sidebarBody.scrollHeight > sidebarBody.clientHeight) {
      sidebarBody.scrollTop = Math.max(0, sidebarBody.scrollHeight - sidebarBody.clientHeight);
      return '.layout__sidebar-body';
    }

    const main = document.querySelector('main');
    if (main instanceof HTMLElement && main.scrollHeight > main.clientHeight) {
      main.scrollTop = Math.max(0, main.scrollHeight - main.clientHeight);
      return 'main';
    }

    const scrolling = document.scrollingElement;
    if (scrolling instanceof HTMLElement && scrolling.scrollHeight > scrolling.clientHeight) {
      scrolling.scrollTop = Math.max(0, scrolling.scrollHeight - scrolling.clientHeight);
      return 'document.scrollingElement';
    }

    return null;
  });

  if (!scrollTarget) {
    const note = 'No scrollable main content area detected; post-scroll screenshot may match default.';
    notes.push(note);
    console.log(`[ui-smoke] ${note}`);
  } else {
    console.log(`[ui-smoke] Scrolled ${scrollTarget} before post-scroll screenshot.`);
  }

  await page.waitForTimeout(200);
  await captureScreenshot(page, 'ui-1920x1080-after-scroll.png');

  if (notes.length > 0) {
    await testInfo.attach('ui-smoke-notes', {
      body: notes.join('\n'),
      contentType: 'text/plain'
    });
  }
});
