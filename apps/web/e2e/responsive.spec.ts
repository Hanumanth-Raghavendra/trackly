import { expect, test } from '@playwright/test';

/**
 * A page wider than the phone makes the Android WebView zoom out until it looks like the desktop
 * site. Every screen must fit the viewport at the narrowest phone widths we support.
 *
 * Signs in once (the demo endpoint is rate limited per IP) and resizes the same page.
 */
const ROUTES = ['today', 'tasks', 'habits', 'focus', 'goals', 'insights', 'review', 'achievements', 'settings'];
const WIDTHS = [360, 390];

test('no screen is wider than a phone', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'sets its own viewport, so one project is enough');

  const context = await browser.newContext({
    viewport: { width: WIDTHS[0]!, height: 800 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the live demo' }).first().click();
  await expect(page).toHaveURL(/\/app\/today$/, { timeout: 30_000 });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ROUTES) {
      await page.goto(`/app/${route}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const { scroll, client } = (await page.evaluate(
        '({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })',
      )) as { scroll: number; client: number };
      expect(scroll, `/app/${route} is ${scroll}px wide in a ${client}px viewport`).toBeLessThanOrEqual(client + 1);
    }
  }
  await context.close();
});
