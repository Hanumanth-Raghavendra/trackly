import { expect, test, type Page } from '@playwright/test';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function openQuickAdd(page: Page) {
  // Desktop has the top-bar button; mobile has the floating action button. Both are "Add task".
  await page.getByRole('button', { name: /^Add task/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Add a task' })).toBeVisible();
}

test('a new user signs up, plans a task, completes it and stays signed in', async ({ page }) => {
  const id = unique();
  const title = `Write the release notes ${id}`;

  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill(`e2e-${id}@example.com`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/app\/today$/);
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

  // Natural-language quick add: the date, tag and priority are parsed as you type.
  await openQuickAdd(page);
  await page.getByRole('dialog').getByLabel('Task', { exact: true }).fill(`${title} today #docs !high`);
  await expect(page.getByRole('dialog').getByText('#docs')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /^Add task/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const complete = page.getByRole('checkbox', { name: `Complete "${title}"` });
  await expect(complete).toBeVisible();
  await complete.click();
  // Finished work folds into "Done today".
  await page.getByRole('button', { name: /Done today/ }).click();
  await expect(page.getByRole('checkbox', { name: `Mark "${title}" as not done` })).toBeChecked();

  // A reload restores the session from the httpOnly refresh cookie.
  await page.reload();
  await expect(page).toHaveURL(/\/app\/today$/);
  await page.goto('/app/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();

  // The insights service picks the completion up from the outbox and awards XP.
  await page.goto('/app/achievements');
  const firstSteps = page.getByRole('listitem').filter({ hasText: 'First Steps' });
  await expect(async () => {
    await page.reload();
    await expect(firstSteps).not.toContainText('locked', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test('the live demo shows eight weeks of history and real insights', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the live demo' }).first().click();
  await expect(page).toHaveURL(/\/app\/today$/, { timeout: 30_000 });
  await expect(page.getByText(/exploring a demo account/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: "Today's plan" })).toBeVisible();

  await page.goto('/app/insights');
  await expect(page.getByRole('heading', { name: 'What the coach noticed' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'When you get things done' })).toBeVisible();

  await page.goto('/app/habits');
  await expect(page.getByText('Read 20 pages').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consistency map' })).toBeVisible();
});

test('signing out returns to the public site and protects the app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the live demo' }).first().click();
  await expect(page).toHaveURL(/\/app\/today$/, { timeout: 30_000 });

  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).not.toHaveURL(/\/app\//);

  await page.goto('/app/tasks');
  await expect(page).toHaveURL(/\/login/);
});
