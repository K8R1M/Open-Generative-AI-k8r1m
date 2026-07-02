const { test, expect } = require('@playwright/test');
const fsp = require('node:fs/promises');
const path = require('node:path');

const nativeRoot = path.resolve(process.env.NATIVE_MEDIA_ROOT || '.native-media-test/e2e');
const realRoot = path.resolve(process.cwd(), '.native-media');

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

async function seedVideoState(page) {
  await page.addInitScript(() => {
    localStorage.setItem('hg_video_studio_persistent', JSON.stringify({
      imageMode: false,
      v2vMode: false,
      selectedModel: 'native.vertex.gemini-omni-flash-preview',
      selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
      selectedAr: '16:9',
      selectedDuration: 8,
      selectedResolution: '',
    }));
  });
}

async function routeControlledGeneration(page, label) {
  let complete = false;
  let counter = 0;
  await page.route(/\/api\/native-media\/v1\/generations$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON();
    counter += 1;
    const jobId = `job-${label}-${counter}`;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: jobId,
        request_id: jobId,
        status: 'running',
        model: body.modelId,
        displayName: body.displayName,
      }),
    });
  });
  await page.route(/\/api\/native-media\/v1\/generations\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const jobId = route.request().url().split('/').pop();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: jobId,
        request_id: jobId,
        status: complete ? 'completed' : 'running',
        model: 'native.vertex.gemini-omni-flash-preview',
        url: `/api/native-media/v1/assets/${jobId}-asset`,
        outputs: [`/api/native-media/v1/assets/${jobId}-asset`],
      }),
    });
  });
  return {
    complete() {
      complete = true;
    },
  };
}

test.beforeEach(async () => {
  await resetFixtureRoot();
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test('video generation completes while Image Studio is mounted and appears without reload', async ({ page }) => {
  const generation = await routeControlledGeneration(page, 'tab');
  await seedVideoState(page);

  await page.goto('/studio/video');
  await page.getByPlaceholder('Name (optional)').fill('cross-tab-clip');
  await page.getByPlaceholder(/Describe/i).fill('cross tab registry video');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('native_generation_registry_v1') || '{}').pending?.length)))
    .toBe(true);
  await page.getByRole('button', { name: 'Image Studio' }).click({ force: true });
  await expect(page).toHaveURL(/\/studio\/image/, { timeout: 15_000 });
  await expect(page.getByPlaceholder(/Describe the image you want to create/i)).toBeVisible({ timeout: 15_000 });
  generation.complete();

  await expect
    .poll(() => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('native_generation_registry_v1') || '{}');
      return stored.undelivered?.some(([, item]) => item?.studio === 'video');
    }), { timeout: 12_000 })
    .toBe(true);
  await page.getByRole('button', { name: 'Video Studio' }).click();
  await expect(page.getByText('cross-tab-clip', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTitle('cross tab registry video')).toBeVisible();
});

test('video generation survives reload mid-flight through registry resume', async ({ page }) => {
  const generation = await routeControlledGeneration(page, 'reload');
  await seedVideoState(page);

  await page.goto('/studio/video');
  await page.getByPlaceholder('Name (optional)').fill('reload-registry-clip');
  await page.getByPlaceholder(/Describe/i).fill('reload registry video');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem('native_generation_registry_v1') || '{}').pending?.length)))
    .toBe(true);

  await page.reload();
  generation.complete();
  await expect(page.getByText('reload-registry-clip', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTitle('reload registry video')).toBeVisible();
});
