import { expect, test, type Page } from '@playwright/test';

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function register(page: Page) {
  const id = unique();
  await page.goto('/register');
  await page.getByLabel('Name').fill('Crud Tester');
  await page.getByLabel('Email').fill(`crud-${id}@example.com`);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app\/today$/);
  return id;
}

test('tasks: create, edit, complete, reopen and delete', async ({ page }) => {
  const id = await register(page);
  const title = `Draft the plan ${id}`;
  const renamed = `Final plan ${id}`;
  await page.goto('/app/tasks');

  await page.getByRole('button', { name: /^Add task/ }).filter({ visible: true }).first().click();
  await page.getByRole('dialog', { name: 'Add a task' }).getByLabel('Task', { exact: true }).fill(`${title} tomorrow #plan`);
  await page.getByRole('dialog').getByRole('button', { name: /^Add task/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const row = (name: string) => page.getByRole('button', { name: new RegExp(name) });
  await expect(row(title)).toBeVisible();

  // Edit: rename and set an estimate.
  await row(title).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title').fill(renamed);
  await editor.getByLabel('Estimate (minutes)').fill('45');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).toBeHidden();
  await expect(row(renamed)).toBeVisible();
  await expect(row(title)).toHaveCount(0);

  // Complete, then reopen.
  await page.getByRole('checkbox', { name: `Complete "${renamed}"` }).click();
  await page.getByRole('button', { name: /Recently completed/ }).click();
  await page.getByRole('checkbox', { name: `Mark "${renamed}" as not done` }).click();
  await expect(page.getByRole('checkbox', { name: `Complete "${renamed}"` })).toBeVisible();

  // A reload keeps the edit (it was saved on the server).
  await page.reload();
  await expect(row(renamed)).toBeVisible();

  // Delete.
  await row(renamed).click();
  await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this task?' }).getByRole('button', { name: 'Delete task' }).click();
  await expect(row(renamed)).toHaveCount(0);
});

test('habits: create, check in, undo, edit and delete', async ({ page }) => {
  const id = await register(page);
  const name = `Stretch ${id}`;
  await page.goto('/app/habits');

  await page.getByRole('button', { name: /New habit|Create a habit/ }).first().click();
  const editor = page.getByRole('dialog', { name: 'New habit' });
  await editor.getByLabel('Name').fill(name);
  await editor.getByRole('button', { name: 'Create habit' }).click();
  await expect(editor).toBeHidden();
  const nameButton = (n: string) => page.getByRole('button', { name: new RegExp(`^${n}`) });
  await expect(nameButton(name)).toBeVisible();

  await page.getByRole('button', { name: `Check in ${name} for today` }).click();
  await expect(page.getByRole('button', { name: `Undo ${name} for today` })).toBeVisible();
  await page.getByRole('button', { name: `Undo ${name} for today` }).click();
  await expect(page.getByRole('button', { name: `Check in ${name} for today` })).toBeVisible();

  await nameButton(name).click();
  const edit = page.getByRole('dialog', { name: 'Edit habit' });
  await edit.getByLabel('Name').fill(`${name} daily`);
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(nameButton(`${name} daily`)).toBeVisible();

  await nameButton(`${name} daily`).click();
  await page.getByRole('dialog', { name: 'Edit habit' }).getByRole('button', { name: 'Delete habit' }).click();
  await page.getByRole('dialog', { name: 'Delete this habit?' }).getByRole('button', { name: 'Delete habit' }).click();
  await expect(nameButton(`${name} daily`)).toHaveCount(0);
});

test('goals: create, edit and delete', async ({ page }) => {
  const id = await register(page);
  const title = `Run a 10K ${id}`;
  await page.goto('/app/goals');

  await page.getByRole('button', { name: /New goal|Create a goal/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New goal' });
  await dialog.getByLabel('Goal').fill(title);
  await dialog.getByRole('button', { name: 'Create goal' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit goal' });
  await edit.getByLabel('Goal').fill(`${title} sooner`);
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`${title} sooner`)).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${title} sooner` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete this goal?' }).getByRole('button', { name: 'Delete goal' }).click();
  await expect(page.getByText(`${title} sooner`)).toHaveCount(0);
});

test('settings: the profile saves and survives a reload', async ({ page }) => {
  await register(page);
  await page.goto('/app/settings');
  await page.getByLabel('Name', { exact: true }).fill('Renamed Tester');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Renamed Tester');
});
