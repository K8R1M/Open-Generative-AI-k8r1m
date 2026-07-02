const { test, expect } = require('@playwright/test');
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

async function seedPersistedVideoState(page, state) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: PERSIST_KEY, value: state },
  );
}

test.beforeAll(async () => {
  await resetFixtureRoot();
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test('native mp4 upload for Omni goes through /uploads, never MuAPI, and feeds the generation request', async ({ page }) => {
  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.gemini-omni-flash-preview',
    selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
    imageMode: false,
    v2vMode: false,
  });

  const muapiRequests = [];
  await page.route('**/muapi.**/*', async (route) => {
    muapiRequests.push(route.request().url());
    await route.abort();
  });

  let uploadRequestUrl = null;
  await page.route('**/api/native-media/v1/uploads', async (route) => {
    uploadRequestUrl = route.request().url();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        assetId: 'asset-native-video-upload',
        id: 'asset-native-video-upload',
        url: '/api/native-media/v1/assets/asset-native-video-upload',
        mime: 'video/mp4',
      }),
    });
  });

  await page.goto('/studio/video');
  await expect(page.getByRole('button', { name: /Gemini Omni Flash Preview/i })).toBeVisible({ timeout: 20_000 });

  const videoInput = page.locator('input[type="file"][accept="video/*"]');
  await videoInput.setInputFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('fake mp4 bytes for e2e upload interception'),
  });

  await expect.poll(() => uploadRequestUrl).not.toBeNull();
  expect(uploadRequestUrl).toContain('/api/native-media/v1/uploads');
  expect(muapiRequests).toHaveLength(0);

  let requestBody = null;
  await page.route('**/api/native-media/v1/generations', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-native-video-upload',
        request_id: 'job-native-video-upload',
        status: 'completed',
        model: requestBody.modelId,
        url: '/api/native-media/v1/assets/fake-native-video-upload-output',
        outputs: ['/api/native-media/v1/assets/fake-native-video-upload-output'],
      }),
    });
  });

  await page.getByPlaceholder(/Describe/i).fill('do something with this video');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect.poll(() => requestBody).not.toBeNull();
  expect(muapiRequests).toHaveLength(0);
  expect(requestBody.inputs).toHaveLength(1);
  expect(requestBody.inputs[0]).toMatchObject({ kind: 'asset', assetId: 'asset-native-video-upload' });
});

test('non-mp4 video shows an inline error for native Omni upload, no MuAPI fallback', async ({ page }) => {
  await seedPersistedVideoState(page, {
    selectedModel: 'native.vertex.gemini-omni-flash-preview',
    selectedModelName: 'Gemini Omni Flash Preview (Server · Vertex AI)',
    imageMode: false,
    v2vMode: false,
  });

  const muapiRequests = [];
  await page.route('**/muapi.**/*', async (route) => {
    muapiRequests.push(route.request().url());
    await route.abort();
  });

  let uploadCalled = false;
  await page.route('**/api/native-media/v1/uploads', async (route) => {
    uploadCalled = true;
    await route.continue();
  });

  await page.goto('/studio/video');
  await expect(page.getByRole('button', { name: /Gemini Omni Flash Preview/i })).toBeVisible({ timeout: 20_000 });

  const videoInput = page.locator('input[type="file"][accept="video/*"]');
  await videoInput.setInputFiles({
    name: 'clip.mov',
    mimeType: 'video/quicktime',
    buffer: Buffer.from('not an mp4'),
  });

  await expect(page.getByText('Native video input supports MP4 only')).toBeVisible();
  expect(uploadCalled).toBe(false);
  expect(muapiRequests).toHaveLength(0);
});
