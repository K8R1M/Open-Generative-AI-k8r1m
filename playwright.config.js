const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const appPort = Number(process.env.PLAYWRIGHT_APP_PORT || 19488);
const gatewayPort = Number(process.env.PLAYWRIGHT_GATEWAY_PORT || 19489);
const nativeRoot = path.resolve(process.cwd(), '.native-media-test', 'e2e');
const realRoot = path.resolve(process.cwd(), '.native-media');

if (nativeRoot === realRoot) {
  throw new Error('Playwright NATIVE_MEDIA_ROOT must not point at real .native-media');
}

process.env.NATIVE_MEDIA_ROOT = nativeRoot;
process.env.NATIVE_MEDIA_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
delete process.env.NATIVE_MEDIA_LIVE_VERTEX;
delete process.env.NATIVE_MEDIA_LIVE_CODEX;
delete process.env.NATIVE_MEDIA_LIVE_GROK;
delete process.env.NATIVE_MEDIA_LIVE_OMNI;
delete process.env.NATIVE_MEDIA_PROJECTS;
delete process.env.NEXT_PUBLIC_STUDIO_PROJECTS;
process.env.NATIVE_MEDIA_VEO_REFERENCE_IMAGES = 'true';
process.env.NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES = 'true';

const withoutProjectFlags = () => {
  const env = { ...process.env };
  delete env.NATIVE_MEDIA_PROJECTS;
  delete env.NEXT_PUBLIC_STUDIO_PROJECTS;
  return env;
};

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${appPort}`,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node native-media-gateway/server.js',
      url: `http://127.0.0.1:${gatewayPort}/api/native-media/v1/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...withoutProjectFlags(),
        NATIVE_MEDIA_ROOT: nativeRoot,
        NATIVE_MEDIA_GATEWAY_PORT: String(gatewayPort),
        NATIVE_MEDIA_ENABLED: 'true',
        NATIVE_MEDIA_VEO_REFERENCE_IMAGES: 'true',
      },
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${appPort}`,
      url: `http://127.0.0.1:${appPort}/studio/image`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...withoutProjectFlags(),
        NATIVE_MEDIA_ROOT: nativeRoot,
        NATIVE_MEDIA_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`,
        NEXT_PUBLIC_NATIVE_VEO_REFERENCE_IMAGES: 'true',
      },
    },
  ],
});
