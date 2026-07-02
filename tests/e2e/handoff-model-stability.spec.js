const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

const nativeRoot = path.resolve(process.env.NATIVE_MEDIA_ROOT || '.native-media-test/e2e');
const realRoot = path.resolve(process.cwd(), '.native-media');
const PERSIST_KEY = 'hg_video_studio_persistent';
let currentPrompt = '';

if (nativeRoot === realRoot) {
  throw new Error('Refusing to run e2e against real .native-media');
}

process.env.NATIVE_MEDIA_ROOT = nativeRoot;
delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
delete process.env.NATIVE_MEDIA_LIVE_CODEX;
delete process.env.NATIVE_MEDIA_LIVE_GROK;
delete process.env.NATIVE_MEDIA_LIVE_OMNI;

const gateway = require('../../native-media-gateway/exports.js');

async function rmFixtureRoot() {
  for (let i = 0; i < 5; i += 1) {
    try {
      await fsp.rm(nativeRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code !== 'ENOTEMPTY' || i === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function resetFixtureRoot() {
  await gateway.scheduler.disposeAll();
  gateway.scheduler.reset();
  await rmFixtureRoot();
}

async function seedGeneratedImage(prompt) {
  const job = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt,
    clientRequestId: `handoff-stability-${Date.now()}-${Math.random()}`,
  });
  for (let i = 0; i < 30; i += 1) {
    const current = await gateway.getGeneration(job.id);
    if (current?.status === 'completed' && current.assetId) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`seed image did not complete: ${job.id}`);
}

async function seedPersistedVideoState(page, state) {
  // Guarded: addInitScript reinjects on every full navigation (page.goto), so
  // a bare setItem would clobber real app state written between navigations.
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: PERSIST_KEY, value: state },
  );
}

async function waitForPersistedImageCount(page, count) {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          return Array.isArray(data.uploadedImageUrls) ? data.uploadedImageUrls.length : 0;
        } catch {
          return -1;
        }
      }, PERSIST_KEY),
    )
    .toBe(count);
}

test.beforeAll(async () => {
  await resetFixtureRoot();
});

test.beforeEach(async ({}, testInfo) => {
  currentPrompt = `handoff stability image ${testInfo.repeatEachIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const seeded = await seedGeneratedImage(currentPrompt);
  assert.equal(seeded.status, 'completed');
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test('Veo 3.1 Fast stays selected across a single-image handoff', async ({ page }) => {
  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.veo-3.1-fast',
    selectedModelName: 'Veo 3.1 Fast (Server · Vertex AI)',
    imageMode: false,
    v2vMode: false,
  });

  await page.goto('/studio/image');
  await expect(page.getByText(currentPrompt)).toBeVisible({ timeout: 20_000 });
  const card = page.getByText(currentPrompt).locator('..').locator('..');
  await card.hover();
  await page.getByTitle('Use as Video Studio input').first().click({ force: true });

  await expect(page).toHaveURL(/\/studio\/video/);
  await expect(page.getByRole('button', { name: /Veo 3\.1 Fast/i })).toBeVisible();
  await expect(page.locator('img[src^="/api/native-media/v1/assets/"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Kept \d+ of \d+/)).toHaveCount(0);
});

test('Veo 3.1 Fast keeps the model and shows "Kept 1 of 2" when a second handoff exceeds capacity', async ({ page }) => {
  const secondPrompt = `handoff stability image second ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const secondSeeded = await seedGeneratedImage(secondPrompt);
  assert.equal(secondSeeded.status, 'completed');

  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.veo-3.1-fast',
    selectedModelName: 'Veo 3.1 Fast (Server · Vertex AI)',
    imageMode: false,
    v2vMode: false,
  });

  await page.goto('/studio/image');
  await expect(page.getByText(currentPrompt)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(secondPrompt)).toBeVisible({ timeout: 20_000 });

  // First handoff: model stays Veo, image applied, no warning yet (1 of 1 kept).
  const firstCard = page.getByText(currentPrompt).locator('..').locator('..');
  await firstCard.hover();
  await firstCard.getByTitle('Use as Video Studio input').click({ force: true });
  await expect(page).toHaveURL(/\/studio\/video/);
  await expect(page.getByRole('button', { name: /Veo 3\.1 Fast/i })).toBeVisible();
  await expect(page.locator('img[src^="/api/native-media/v1/assets/"]').first()).toBeVisible({ timeout: 20_000 });
  await waitForPersistedImageCount(page, 1);

  // Second handoff: model STILL stays Veo, but capacity (1, frames mode) means
  // only 1 of the combined 2 images survives — a warning chip must appear.
  // Client-side tab navigation (not a full reload) mirrors real usage.
  await page.getByRole('button', { name: 'Image Studio' }).click();
  await expect(page).toHaveURL(/\/studio\/image/);
  const secondCard = page.getByText(secondPrompt).locator('..').locator('..');
  await secondCard.hover();
  await secondCard.getByTitle('Use as Video Studio input').click({ force: true });

  await expect(page).toHaveURL(/\/studio\/video/);
  await expect(page.getByRole('button', { name: /Veo 3\.1 Fast/i })).toBeVisible();
  await expect(page.getByText('Kept 1 of 2')).toBeVisible({ timeout: 20_000 });
});
