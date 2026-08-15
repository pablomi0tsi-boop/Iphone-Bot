import { expect, test } from '@playwright/test';
import path from 'node:path';

const ARTIFACTS = '/opt/cursor/artifacts';

test('warehouse with restored finance UI', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Magazyn' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Gotówka/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Stan konta/ }).first()).toBeVisible();
  await expect(page.getByText('Wartość telefonów').first()).toBeVisible();
  await expect(page.getByText('Łączna wartość').first()).toBeVisible();

  await page.getByRole('button', { name: /Gotówka/ }).first().click();
  await page.locator('#edit-finance-form input').fill('10000');
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await page.getByRole('button', { name: '+ Dodaj telefon' }).click();
  const form = page.locator('#phone-form');
  await form.locator('select').nth(0).selectOption({ label: 'iPhone 15 Pro' });
  await form.locator('select').nth(1).selectOption('256 GB');
  await form.getByPlaceholder('15 cyfr').fill('123456789012345');
  await form.locator('input[type="number"]').nth(0).fill('98');
  await form.locator('input[type="number"]').nth(1).fill('2000');
  await expect(form.locator('input[type="number"]').nth(2)).toHaveValue('2200');
  await page.getByRole('button', { name: 'DODAJ DO MAGAZYNU' }).click();

  await page.getByPlaceholder('Szukaj modelu...').fill('15 Pro');
  await page
    .locator('.model-row')
    .filter({ has: page.locator('.model-row-name', { hasText: /^iPhone 15 Pro$/ }) })
    .click();

  await expect(page.getByRole('heading', { name: 'iPhone 15 Pro' })).toBeVisible();
  await expect(page.locator('.unit-card')).toContainText('256 GB');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_restored_ui_model.png'),
    fullPage: true,
  });

  await page.locator('.unit-card').click();
  await page.getByRole('button', { name: 'Sprzedaj' }).click();
  await page.locator('#sell-unit-form input[type="text"]').fill('Jan Kowalski');
  await page.locator('#sell-unit-form input[type="number"]').fill('2500');
  await page.getByRole('button', { name: 'Potwierdź sprzedaż' }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await expect(page.locator('.sale-list')).toContainText('Jan Kowalski');
  await expect(page.locator('.monthly-stats')).toContainText('500');

  await page.getByRole('navigation').getByRole('button', { name: 'Historia' }).click();
  await expect(page.locator('.history-item').first()).toContainText('Sprzedaż');
  await expect(page.locator('.history-list')).toContainText('Jan Kowalski');

  await page.getByRole('navigation').getByRole('button', { name: 'Finanse' }).click();
  await expect(page.locator('.finance-panel')).toContainText('500');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_restored_ui_finance.png'),
    fullPage: true,
  });
});
