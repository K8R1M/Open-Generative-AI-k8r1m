const { test, expect } = require('@playwright/test');

test('Merlin Studio shell branding is visible without the promo banner', async ({ page }) => {
  await page.goto('/studio/image');

  await expect(page.getByRole('img', { name: 'Merlin Studio' })).toBeVisible();
  await expect(page.locator('header')).toContainText('Image Studio');
  await expect(page.getByText(/Unrestricted AI Images/)).toHaveCount(0);
});
