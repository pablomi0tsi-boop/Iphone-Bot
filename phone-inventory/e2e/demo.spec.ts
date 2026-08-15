import { expect, test } from '@playwright/test';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('visual warehouse walkthrough', async ({ page }) => {
  await page.goto('/magazyn');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Magazyn' })).toBeVisible();
  await pause(600);

  await page.getByRole('button', { name: 'DODAJ TELEFON' }).click();
  await pause(400);
  const form = page.locator('#phone-form');
  await form.locator('select').nth(0).selectOption({ label: 'iPhone 15 Pro' });
  await form.locator('select').nth(1).selectOption('256 GB');
  await form.getByPlaceholder('15 cyfr').fill('123456789012345');
  await form.locator('input[type="number"]').nth(0).fill('98');
  await form.locator('input[type="number"]').nth(1).fill('2000');
  await pause(400);
  await page.getByRole('button', { name: 'DODAJ DO MAGAZYNU' }).click();
  await pause(800);

  await page
    .locator('.model-row')
    .filter({ has: page.locator('.model-row-name', { hasText: /^iPhone 15 Pro$/ }) })
    .click();
  await pause(1000);
  await page.getByRole('button', { name: '← Magazyn' }).click();
  await pause(800);
});
