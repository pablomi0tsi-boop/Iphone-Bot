import { expect, test } from '@playwright/test';
import path from 'node:path';

const ARTIFACTS = '/opt/cursor/artifacts';

test('full inventory finance flow on mobile viewport', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Magazyn' })).toBeVisible();

  // 1) Set cash
  await page.getByRole('button', { name: /Gotówka/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Gotówka' })).toBeVisible();
  await page.locator('#edit-finance-form input').fill('10000');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('button', { name: /Gotówka/ }).first()).toContainText(
    '10',
  );

  // 2) Set bank
  await page.getByRole('button', { name: /Stan konta/ }).first().click();
  await page.locator('#edit-finance-form input').fill('5000');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('button', { name: /Stan konta/ }).first()).toContainText(
    '5',
  );

  // 3) Add phone
  await page.getByRole('button', { name: '+ Dodaj telefon' }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj telefon' })).toBeVisible();
  await page.locator('#add-phone-form select').nth(0).selectOption({ label: 'iPhone 15 Pro' });
  await page.locator('#add-phone-form input[type="number"]').fill('2000');
  await page.locator('#add-phone-form select').nth(1).selectOption('256 GB');
  await page.locator('#add-phone-form input[type="text"]').fill('123456789012345');
  await page.locator('#add-phone-form textarea').fill('testowy');
  await page.getByRole('button', { name: 'Zapisz telefon' }).click();

  // Search and verify stock
  await page.getByPlaceholder('Szukaj modelu, np. 15 Pro').fill('15 Pro');
  const card = page.locator('.model-card').filter({
    has: page.getByRole('heading', { name: 'iPhone 15 Pro', exact: true }),
  });
  await expect(card.locator('.qty-number')).toHaveText('1');
  await expect(card.locator('.meta-value').first()).toContainText('2');
  await expect(card.locator('.meta-value').nth(1)).toContainText('2');

  // Cash deducted
  await expect(page.getByRole('button', { name: /Gotówka/ }).first()).toContainText(
    '8',
  );

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_after_add_phone.png'),
    fullPage: true,
  });

  // 4) Increment via +
  await card.getByRole('button', { name: /Zwiększ stan/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#add-phone-form input[type="number"]').fill('2200');
  await page.getByRole('button', { name: 'Zapisz telefon' }).click();
  await expect(card.locator('.qty-number')).toHaveText('2');

  // 5) Decrement via −
  await card.getByRole('button', { name: /Zmniejsz stan/ }).click();
  await expect(card.locator('.qty-number')).toHaveText('1');

  // 6) Sell
  await card.getByRole('button', { name: 'Sprzedaj' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#sell-phone-form input[type="number"]').fill('2500');
  await page.getByRole('button', { name: 'Potwierdź sprzedaż' }).click();
  await expect(card.locator('.qty-number')).toHaveText('0');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_after_sale.png'),
    fullPage: true,
  });

  // 7) Monthly profit tab
  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await expect(page.getByRole('heading', { name: 'Zysk' })).toBeVisible();
  await expect(page.locator('.monthly-stat-value').first()).toContainText('1 szt.');
  await expect(page.locator('.monthly-stats')).toContainText('2500');
  await expect(page.locator('.monthly-stats')).toContainText('500');
  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_monthly_profit.png'),
    fullPage: true,
  });

  // Switch months — neighboring month empty
  await page.getByRole('button', { name: /Poprzedni miesiąc/ }).click();
  await expect(page.locator('.monthly-stat-value').first()).toContainText('0 szt.');
  await page.getByRole('button', { name: /Następny miesiąc/ }).click();
  await expect(page.locator('.monthly-stat-value').first()).toContainText('1 szt.');

  // 8) History
  await page.getByRole('navigation').getByRole('button', { name: 'Historia' }).click();
  await expect(page.locator('.history-item').first()).toContainText('Sprzedaż');
  await expect(page.locator('.history-list')).toContainText('iPhone 15 Pro');
  await expect(page.locator('.history-list')).toContainText('500');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_history.png'),
    fullPage: true,
  });

  // 9) Finance tab
  await page.getByRole('navigation').getByRole('button', { name: 'Finanse' }).click();
  await expect(page.locator('.finance-panel')).toContainText('500');
  await expect(page.locator('.finance-card.wide')).toContainText('+');

  // 10) Persistence
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Magazyn' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await expect(page.locator('.monthly-stat-value').first()).toContainText('1 szt.');
  await expect(page.locator('.monthly-stats')).toContainText('500');
  await page.getByRole('navigation').getByRole('button', { name: 'Historia' }).click();
  await expect(page.locator('.history-item').first()).toContainText('Sprzedaż');
  await page.getByRole('navigation').getByRole('button', { name: 'Finanse' }).click();
  await expect(page.locator('.finance-card.wide')).toContainText('500');

  await page.screenshot({
    path: path.join(ARTIFACTS, 'e2e_after_reload.png'),
    fullPage: true,
  });
});
