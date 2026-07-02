const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

const nativeRoot = path.resolve(process.env.NATIVE_MEDIA_ROOT || '.native-media-test/e2e');
const realRoot = path.resolve(process.cwd(), '.native-media');
const PERSIST_KEY = 'hg_video_studio_persistent';

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
    clientRequestId: `veo-ref-mode-${Date.now()}-${Math.random()}`,
  });
  for (let i = 0; i < 30; i += 1) {
    const current = await gateway.getGeneration(job.id);
    if (current?.status === 'completed' && current.assetId) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`seed image did not complete: ${job.id}`);
}

async function seedPersistedVideoState(page, state) {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: PERSIST_KEY, value: state },
  );
}

test.beforeAll(async () => {
  await resetFixtureRoot();
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test.beforeEach(async () => {
  await resetFixtureRoot();
});

test('Veo Frames/References toggle only appears for Veo models with an image reference', async ({ page }) => {
  const img = await seedGeneratedImage(`veo toggle appears ${Date.now()}`);
  assert.equal(img.status, 'completed');

  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.gemini-omni-flash-preview',
    selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
    imageMode: true,
    v2vMode: false,
    uploadedImageUrls: [`/api/native-media/v1/assets/${img.assetId}`],
  });
  await page.goto('/studio/video');
  await expect(page.getByRole('button', { name: /Gemini Omni Flash Preview/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Frames' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'References' })).toHaveCount(0);

  await page.getByRole('button', { name: /Gemini Omni Flash Preview/i }).click();
  await page.getByText('Veo 3.1 (Server · Vertex AI)').first().click();

  await expect(page.getByRole('button', { name: 'Frames' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'References' })).toBeVisible();
});

test('References mode locks duration to 8s and aspect ratio to 16:9, and submits reference-only roles', async ({ page }) => {
  const img1 = await seedGeneratedImage(`veo ref mode one ${Date.now()}`);
  const img2 = await seedGeneratedImage(`veo ref mode two ${Date.now()}`);
  assert.equal(img1.status, 'completed');
  assert.equal(img2.status, 'completed');

  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.veo-3.1',
    selectedModelName: 'Veo 3.1 (Server · Vertex AI)',
    imageMode: true,
    v2vMode: false,
    selectedAr: '9:16',
    selectedDuration: 4,
    uploadedImageUrls: [
      `/api/native-media/v1/assets/${img1.assetId}`,
      `/api/native-media/v1/assets/${img2.assetId}`,
    ],
    veoInputMode: 'frames',
  });

  await page.goto('/studio/video');
  await expect(page.getByRole('button', { name: 'Frames' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'References' })).toBeVisible();

  // Still in Frames mode: duration/AR are NOT locked (Veo's normal duration menu applies).
  await expect(page.getByRole('button', { name: '16:9' })).toBeEnabled();

  await page.getByRole('button', { name: 'References' }).click();

  // Switching to References mode forces and locks duration=8s, AR=16:9.
  await expect(page.getByRole('button', { name: '16:9' })).toBeVisible();
  await expect(page.getByRole('button', { name: '8s' })).toBeVisible();
  await expect(page.getByText('8s and 16:9 required for Veo references')).toBeVisible();
  await expect(page.getByRole('button', { name: '16:9' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '8s' })).toBeDisabled();

  let requestBody = null;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-veo-references',
        request_id: 'job-veo-references',
        status: 'completed',
        model: requestBody.modelId,
        url: '/api/native-media/v1/assets/fake-veo-references-output',
        outputs: ['/api/native-media/v1/assets/fake-veo-references-output'],
      }),
    });
  });

  await page.getByPlaceholder(/Describe/i).fill('two subjects in the same scene');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBody).not.toBeNull();
  expect(requestBody.parameters.durationSeconds).toBe(8);
  expect(requestBody.parameters.aspectRatio).toBe('16:9');
  expect(requestBody.inputs).toHaveLength(2);
  for (const input of requestBody.inputs) {
    expect(input.role).toBe('reference');
  }
  expect(requestBody.inputs.some((i) => i.role === 'first-frame' || i.role === 'last-frame')).toBe(false);
});

test('Frames mode still submits first-frame/last-frame roles for Veo', async ({ page }) => {
  const img1 = await seedGeneratedImage(`veo frames mode ${Date.now()}`);
  assert.equal(img1.status, 'completed');

  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.veo-3.1',
    selectedModelName: 'Veo 3.1 (Server · Vertex AI)',
    imageMode: true,
    v2vMode: false,
    selectedAr: '16:9',
    selectedDuration: 8,
    uploadedImageUrls: [`/api/native-media/v1/assets/${img1.assetId}`],
    veoInputMode: 'frames',
  });

  await page.goto('/studio/video');
  await expect(page.getByRole('button', { name: 'Frames' })).toBeVisible({ timeout: 20_000 });

  let requestBody = null;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-veo-frames',
        request_id: 'job-veo-frames',
        status: 'completed',
        model: requestBody.modelId,
        url: '/api/native-media/v1/assets/fake-veo-frames-output',
        outputs: ['/api/native-media/v1/assets/fake-veo-frames-output'],
      }),
    });
  });

  await page.getByPlaceholder(/Describe/i).fill('single subject first frame');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBody).not.toBeNull();
  expect(requestBody.inputs).toHaveLength(1);
  expect(requestBody.inputs[0].role).toBe('first-frame');
});
