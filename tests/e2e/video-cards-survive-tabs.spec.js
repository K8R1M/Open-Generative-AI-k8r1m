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

// Real, browser-decodable VP8/WebM fixture. Playwright's bundled open-source
// Chromium build has no H.264 decoder, so the gateway's mp4 fake-stub (and any
// mp4 fixture) always fails with DEMUXER_ERROR_NO_SUPPORTED_STREAMS here.
// WebM/VP8 is natively supported. Regenerate with:
//   ffmpeg -f lavfi -i color=c=blue:s=64x64:d=1 -c:v libvpx -pix_fmt yuv420p tiny-real.webm
// This spec serves the fixture for every asset request (with Range support)
// so it can assert LazyVideo's decoder-pool behavior independent of codec
// availability in the CI/test Chromium build.
let tinyRealWebm;

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

async function seedGeneratedVideo(prompt) {
  const job = await gateway.submitGeneration({
    modelId: 'native.vertex.veo-3.1-fast',
    task: 'text-to-video',
    prompt,
    parameters: { aspectRatio: '16:9', durationSeconds: 8, resolution: '720p', audio: true },
    clientRequestId: `tab-churn-${Date.now()}-${Math.random()}`,
  });
  for (let i = 0; i < 60; i += 1) {
    const current = await gateway.getGeneration(job.id);
    if (current?.status === 'completed' && current.assetId) return current;
    if (['failed', 'cancelled'].includes(current?.status)) {
      throw new Error(`seed video failed: ${job.id} status=${current.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`seed video did not complete: ${job.id}`);
}

test.beforeAll(async () => {
  await resetFixtureRoot();
  tinyRealWebm = await fsp.readFile(path.join(process.cwd(), 'tests/fixtures/tiny-real.webm'));
});

test.afterAll(async () => {
  await resetFixtureRoot();
});

test('video history cards keep rendering playable <video> elements across repeated tab churn', async ({ page }) => {
  test.setTimeout(180_000);
  const prompts = [];
  for (let i = 0; i < 12; i += 1) {
    const label = `tab churn video ${i} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const seeded = await seedGeneratedVideo(label);
    assert.equal(seeded.status, 'completed');
    prompts.push(label);
  }

  await page.route('**/api/native-media/v1/assets/**', async (route) => {
    const range = route.request().headers()['range'];
    if (!range) {
      await route.fulfill({
        status: 200,
        contentType: 'video/webm',
        headers: { 'accept-ranges': 'bytes', 'content-length': String(tinyRealWebm.length) },
        body: tinyRealWebm,
      });
      return;
    }
    const total = tinyRealWebm.length;
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : total - 1;
    const chunk = tinyRealWebm.subarray(start, end + 1);
    await route.fulfill({
      status: 206,
      contentType: 'video/webm',
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${total}`,
        'content-length': String(chunk.length),
      },
      body: chunk,
    });
  });

  await page.goto('/studio/video');
  for (const label of prompts) {
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 20_000 });
  }

  for (let i = 0; i < 10; i += 1) {
    await page.getByRole('button', { name: 'Image Studio' }).click();
    await expect(page).toHaveURL(/\/studio\/image/);
    await page.getByRole('button', { name: 'Video Studio' }).click();
    await expect(page).toHaveURL(/\/studio\/video/);
  }

  // After the churn, cards must still be present and each one's LazyVideo must
  // mount a real, decodable <video> element on hover (the decoder-pool proxy).
  for (const label of prompts) {
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 20_000 });
    const card = page.getByText(label, { exact: true }).locator('..').locator('..');
    await card.hover();
    const video = card.locator('video');
    await expect(video).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => video.evaluate((el) => el.videoWidth), { timeout: 20_000 })
      .toBeGreaterThan(0);
  }
});
