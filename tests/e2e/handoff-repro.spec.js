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
    clientRequestId: `handoff-repro-${Date.now()}-${Math.random()}`,
    displayName: 'handoff-repro-image',
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
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: PERSIST_KEY, value: state },
  );
}

async function openSeededImageStudio(page) {
  await page.goto('/studio/image');
  await expect(page.getByText(currentPrompt)).toBeVisible({ timeout: 20_000 });
}

async function handoffFirstImageToVideo(page) {
  const card = page.getByText(currentPrompt).locator('..').locator('..');
  await card.hover();
  await page.getByTitle('Use as Video Studio input').first().click({ force: true });
  await expect(page).toHaveURL(/\/studio\/video/);
}

async function expectVisibleVideoReference(page) {
  await expect(page.locator('img[src^="/api/native-media/v1/assets/"]').first()).toBeVisible({ timeout: 20_000 });
}

async function runHandoff(page) {
  await openSeededImageStudio(page);
  await handoffFirstImageToVideo(page);
  await expectVisibleVideoReference(page);
}

test.beforeAll(async () => {
  await resetFixtureRoot();
});

test.beforeEach(async ({}, testInfo) => {
  currentPrompt = `handoff repro image ${testInfo.repeatEachIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const seeded = await seedGeneratedImage(currentPrompt);
  assert.equal(seeded.status, 'completed');
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test('virgin storage shows handed-off image as visible Video Studio reference', async ({ page }) => {
  await runHandoff(page);
});

test('persisted Omni text mode still shows handed-off image as visible Video Studio reference', async ({ page }) => {
  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.gemini-omni-flash-preview',
    selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
    imageMode: false,
  });
  await runHandoff(page);
});

test('persisted Omni handoff generation request includes handed-off first-frame asset', async ({ page }) => {
  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.gemini-omni-flash-preview',
    selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
    imageMode: false,
  });

  let requestBody = null;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-e2e-video',
        request_id: 'job-e2e-video',
        status: 'completed',
        model: requestBody.modelId,
        url: '/api/native-media/v1/assets/fake-video-asset',
        outputs: ['/api/native-media/v1/assets/fake-video-asset'],
      }),
    });
  });

  await runHandoff(page);
  await page.getByPlaceholder(/Describe the motion/i).fill('make it move');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBody).not.toBeNull();
  expect(requestBody.inputs[0]).toMatchObject({ role: 'first-frame', kind: 'asset' });
  expect(requestBody.inputs[0].assetId).toMatch(/^asset-/);
});

test('handoff remains visible after model changes between attempts', async ({ page }) => {
  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.gemini-omni-flash-preview',
    selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
    imageMode: false,
  });
  await runHandoff(page);

  await page.getByRole('button', { name: /Gemini Omni Flash Preview/i }).click();
  await page.getByText('Veo 3.1 (Server · Vertex AI)').first().click();
  await page.goto('/studio/image');
  await handoffFirstImageToVideo(page);
  await expectVisibleVideoReference(page);
});
