const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
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

async function seedGeneratedImage(prompt) {
  const job = await gateway.submitGeneration({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt,
    clientRequestId: `naming-${Date.now()}-${Math.random()}`,
  });
  for (let i = 0; i < 30; i += 1) {
    const current = await gateway.getGeneration(job.id);
    if (current?.status === 'completed' && current.assetId) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`seed image did not complete: ${job.id}`);
}

test.beforeEach(async () => {
  await resetFixtureRoot();
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test('native card rename persists after reload', async ({ page }) => {
  const prompt = `unnamed fixture ${Date.now()}`;
  const seeded = await seedGeneratedImage(prompt);
  assert.equal(seeded.displayName || '', '');

  await page.goto('/studio/image');
  await expect(page.getByText(prompt)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Renamed_fixture')).toHaveCount(0);

  page.once('dialog', async (dialog) => {
    assert.equal(dialog.message(), 'Rename generation');
    await dialog.accept('Renamed_fixture');
  });
  const card = page.getByText(prompt).locator('..').locator('..');
  await card.hover();
  await page.getByTitle('Rename').first().click({ force: true });

  await expect(page.getByText('Renamed_fixture')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Renamed_fixture')).toBeVisible({ timeout: 20_000 });
});

test('native image generation keeps the name sticky and auto-suffixes repeat submits', async ({ page }) => {
  const requestBodies = [];
  let jobCounter = 0;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    const body = route.request().postDataJSON();
    requestBodies.push(body);
    jobCounter += 1;
    const jobId = `job-named-image-${jobCounter}`;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: jobId,
        request_id: jobId,
        status: 'completed',
        model: body.modelId,
        displayName: body.displayName,
        downloadName: body.displayName,
        url: `/api/native-media/v1/assets/fake-named-image-${jobCounter}`,
        outputs: [`/api/native-media/v1/assets/fake-named-image-${jobCounter}`],
      }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('hg_image_studio_persistent', JSON.stringify({
      selectedModelId: 'native.vertex.nano-banana-2',
      selectedModelName: 'Nano Banana 2 (Server · Vertex AI)',
      selectedAr: '1:1',
      selectedQuality: '1K',
      maxImages: 11,
    }));
  });

  await page.goto('/studio/image');
  await page.getByPlaceholder('Name (optional)').fill('skydivers');
  await page.getByPlaceholder(/Describe the image/i).fill('generated named image one');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBodies.length).toBe(1);
  expect(requestBodies[0].displayName).toBe('skydivers');
  await expect(page.getByText('skydivers', { exact: true })).toBeVisible();
  // Sticky name: the field must NOT clear after a successful submit.
  await expect(page.getByPlaceholder('Name (optional)')).toHaveValue('skydivers');

  await page.getByPlaceholder(/Describe the image/i).fill('generated named image two');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBodies.length).toBe(2);
  expect(requestBodies[1].displayName).toBe('skydivers-001');
  await expect(page.getByText('skydivers-001', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Name (optional)')).toHaveValue('skydivers');

  // Editing the name field starts a fresh bare-name sequence.
  await page.getByPlaceholder('Name (optional)').fill('newname');
  await page.getByPlaceholder(/Describe the image/i).fill('generated named image three');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBodies.length).toBe(3);
  expect(requestBodies[2].displayName).toBe('newname');
  await expect(page.getByText('newname', { exact: true })).toBeVisible();
});

test('native video generation keeps the name sticky and auto-suffixes repeat submits', async ({ page }) => {
  const requestBodies = [];
  let jobCounter = 0;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    const body = route.request().postDataJSON();
    requestBodies.push(body);
    jobCounter += 1;
    const jobId = `job-named-video-${jobCounter}`;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: jobId,
        request_id: jobId,
        status: 'completed',
        model: body.modelId,
        displayName: body.displayName,
        downloadName: body.displayName,
        url: `/api/native-media/v1/assets/fake-named-video-${jobCounter}`,
        outputs: [`/api/native-media/v1/assets/fake-named-video-${jobCounter}`],
      }),
    });
  });
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

  await page.goto('/studio/video');
  await page.getByPlaceholder('Name (optional)').fill('clip');
  await page.getByPlaceholder(/Describe/i).fill('generated named video one');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBodies.length).toBe(1);
  expect(requestBodies[0].displayName).toBe('clip');
  await expect(page.getByText('clip', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Name (optional)')).toHaveValue('clip');

  await page.getByPlaceholder(/Describe/i).fill('generated named video two');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBodies.length).toBe(2);
  expect(requestBodies[1].displayName).toBe('clip-001');
  await expect(page.getByText('clip-001', { exact: true })).toBeVisible();
});

test('native video naming sequence survives a page reload mid-sequence', async ({ page }) => {
  let jobCounter = 0;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    const body = route.request().postDataJSON();
    jobCounter += 1;
    const jobId = `job-reload-video-${jobCounter}`;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: jobId,
        request_id: jobId,
        status: 'completed',
        model: body.modelId,
        displayName: body.displayName,
        downloadName: body.displayName,
        url: `/api/native-media/v1/assets/fake-reload-video-${jobCounter}`,
        outputs: [`/api/native-media/v1/assets/fake-reload-video-${jobCounter}`],
      }),
    });
  });
  // addInitScript reinjects on every navigation, including reload() below —
  // guard so the reload doesn't clobber the app's own persisted nameSequence.
  await page.addInitScript(() => {
    if (localStorage.getItem('hg_video_studio_persistent')) return;
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

  await page.goto('/studio/video');
  await page.getByPlaceholder('Name (optional)').fill('reload-clip');
  await page.getByPlaceholder(/Describe/i).fill('reload sequence video one');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('reload-clip', { exact: true })).toBeVisible();

  // The name sequence is persisted via a debounced localStorage write; wait
  // for it to land before reloading so the sequence survives the reload.
  await expect.poll(() =>
    page.evaluate(() => {
      try {
        const data = JSON.parse(localStorage.getItem('hg_video_studio_persistent') || '{}');
        return data?.nameSequence?.base || '';
      } catch {
        return '';
      }
    }),
  ).toBe('reload-clip');

  await page.reload();
  await page.getByPlaceholder('Name (optional)').fill('reload-clip');
  await page.getByPlaceholder(/Describe/i).fill('reload sequence video two');

  let requestBody = null;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-reload-video-after',
        request_id: 'job-reload-video-after',
        status: 'completed',
        model: requestBody.modelId,
        displayName: requestBody.displayName,
        downloadName: requestBody.displayName,
        url: '/api/native-media/v1/assets/fake-reload-video-after',
        outputs: ['/api/native-media/v1/assets/fake-reload-video-after'],
      }),
    });
  });
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBody).not.toBeNull();
  expect(requestBody.displayName).toBe('reload-clip-001');
});
