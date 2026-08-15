/**
 * Slow visual demo for walkthrough recording (not part of CI assertions).
 * Run: npx playwright test e2e/demo.spec.ts
 */
import { expect, test } from '@playwright/test';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('visual walkthrough demo', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Magazyn' })).toBeVisible();
  await pause(800);

  await page.getByRole('button', { name: /Gotówka/ }).first().click();
  await page.locator('#edit-finance-form input').fill('10000');
  await pause(400);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await pause(600);

  await page.getByRole('button', { name: /Stan konta/ }).first().click();
  await page.locator('#edit-finance-form input').fill('5000');
  await pause(400);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await pause(700);

  await page.getByRole('button', { name: '+ Dodaj telefon' }).click();
  await pause(400);
  await page.locator('#add-phone-form select').first().selectOption({ label: 'iPhone 15 Pro' });
  await page.locator('#add-phone-form input[type="number"]').fill('2000');
  await page.locator('#add-phone-form input[type="text"]').fill('123456789012345');
  await page.locator('#add-phone-form textarea').fill('demo');
  await pause(500);
  await page.getByRole('button', { name: 'Zapisz telefon' }).click();
  await pause(900);

  await page.getByPlaceholder('Szukaj modelu, np. 15 Pro').fill('15 Pro');
  await pause(700);
  const card = page.locator('.model-card').filter({
    has: page.getByRole('heading', { name: 'iPhone 15 Pro', exact: true }),
  });
  await expect(card.locator('.qty-number')).toHaveText('1');

  await card.getByRole('button', { name: /Zwiększ stan/ }).click();
  await pause(400);
  await page.locator('#add-phone-form input[type="number"]').fill('2200');
  await page.getByRole('button', { name: 'Zapisz telefon' }).click();
  await expect(card.locator('.qty-number')).toHaveText('2');
  await pause(800);

  await card.getByRole('button', { name: /Zmniejsz stan/ }).click();
  await expect(card.locator('.qty-number')).toHaveText('1');
  await pause(800);

  await card.getByRole('button', { name: 'Sprzedaj' }).click();
  await pause(400);
  await page.locator('#sell-phone-form input[type="number"]').fill('2500');
  await pause(500);
  await page.getByRole('button', { name: 'Potwierdź sprzedaż' }).click();
  await expect(card.locator('.qty-number')).toHaveText('0');
  await pause(900);

  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await pause(1200);
  await page.getByRole('navigation').getByRole('button', { name: 'Historia' }).click();
  await pause(1200);
  await page.getByRole('navigation').getByRole('button', { name: 'Finanse' }).click();
  await pause(1200);
  await page.reload();
  await pause(1000);
  await page.getByRole('navigation').getByRole('button', { name: 'Zysk' }).click();
  await expect(page.locator('.monthly-stats')).toContainText('500');
  await pause(800);
  await page.getByRole('navigation').getByRole('button', { name: 'Finanse' }).click();
  await expect(page.locator('.finance-card.wide')).toContainText('500');
  await pause(1200);
});
