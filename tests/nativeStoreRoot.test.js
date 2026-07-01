'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const fsp = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXPORTS = path.join(REPO_ROOT, 'native-media-gateway', 'exports.js');

async function withTempDir(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'native-store-root-'));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function resolvedRoot({ cwd, nativeMediaRoot }) {
  const env = { ...process.env };
  delete env.NATIVE_MEDIA_ROOT;
  if (nativeMediaRoot) env.NATIVE_MEDIA_ROOT = nativeMediaRoot;
  const result = spawnSync(
    process.execPath,
    ['-e', `process.stdout.write(require(${JSON.stringify(EXPORTS)})._storeRootForTest)`],
    { cwd, env, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('native media default root is repo-relative, not cwd-relative', async () => {
  await withTempDir(async (cwd) => {
    assert.equal(resolvedRoot({ cwd }), path.join(REPO_ROOT, '.native-media'));
  });
});

test('NATIVE_MEDIA_ROOT overrides the repo-relative default', async () => {
  await withTempDir(async (cwd) => {
    const explicit = path.join(cwd, 'explicit-store');
    assert.equal(resolvedRoot({ cwd, nativeMediaRoot: explicit }), explicit);
  });
});
