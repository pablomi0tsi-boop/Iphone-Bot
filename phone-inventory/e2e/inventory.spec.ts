import { expect, test } from '@playwright/test';
import path from 'node:path';

const ARTIFACTS = '/opt/cursor/artifacts';

test('simple warehouse flow on mobile viewport', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: '📱 Magazyn' })).toBeVisible();

  await page.getByRole('button', { name: 'DODAJ TELEFON' }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj telefon' })).toBeVisible();

  const form = page.locator('#phone-form');
  await form.locator('select').nth(0).selectOption({ label: 'iPhone 15 Pro' });
  await form.locator('select').nth(1).selectOption('256 GB');
  await form.getByPlaceholder('15 cyfr').fill('123456789012345');
  await form.locator('input[type="number"]').nth(0).fill('98');
  await form.locator('textarea').fill('testowy');
  await form.locator('input[type="number"]').nth(1).fill('2000');
  await expect(form.locator('input[type="number"]').nth(2)).toHaveValue('2200');
  await page.getByRole('button', { name: 'DODAJ DO MAGAZYNU' }).click();

  await expect(page.locator('.summary-strip')).toContainText('1 szt.');
  await expect(page.locator('.summary-strip')).toContainText('2200');

  await page.getByPlaceholder('Szukaj modelu...').fill('15 Pro');
  await page
    .locator('.model-row')
    .filter({ has: page.locator('.model-row-name', { hasText: /^iPhone 15 Pro$/ }) })
    .click();

  await expect(page.getByRole('heading', { name: 'iPhone 15 Pro' })).toBeVisible();
  await expect(page.locator('.page-subtitle')).toContainText('1 szt.');
  await expect(page.locator('.page-subtitle')).toContainText('2200');
  await expect(page.locator('.unit-card')).toContainText('256 GB');
  await expect(page.locator('.unit-card')).toContainText('98%');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_warehouse_model.png'),
    fullPage: true,
  });

  await page.locator('.unit-card').click();
  await expect(page.getByRole('dialog', { name: 'Telefon' })).toBeVisible();
  await page.getByRole('button', { name: 'Sprzedaj' }).click();
  await page
    .locator('#sell-unit-form input[type="text"]')
    .fill('Jan Kowalski');
  await page.locator('#sell-unit-form input[type="number"]').fill('2500');
  await page.getByRole('button', { name: 'Potwierdź sprzedaż' }).click();

  await expect(page.getByText('Brak telefonów tego modelu w magazynie.')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await expect(page.locator('.monthly-stat-value').first()).toContainText('1 szt.');
  await expect(page.locator('.monthly-stats')).toContainText('500');
  await expect(page.locator('.sale-list')).toContainText('Jan Kowalski');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_monthly_profit.png'),
    fullPage: true,
  });

  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await expect(page.locator('.monthly-stats')).toContainText('500');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_after_reload.png'),
    fullPage: true,
  });
});
