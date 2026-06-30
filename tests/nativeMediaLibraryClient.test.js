'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadNative } = require('./fixtures/nativeContract');

function response(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'ERR',
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

async function withBrowser(fetchImpl, fn) {
  const oldWindow = global.window;
  const oldFetch = global.fetch;
  global.fetch = fetchImpl;
  global.window = { fetch: fetchImpl };
  try {
    return await fn();
  } finally {
    global.fetch = oldFetch;
    global.window = oldWindow;
  }
}

test('native library client lists by kind/limit and deletes by jobId only', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'native library client');
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (opts.method === 'DELETE') return response({});
    return response({
      items: [
        {
          jobId: 'job-1',
          url: '/api/native-media/v1/assets/asset-1',
          prompt: 'copy me',
          native: true,
          deletable: true,
        },
      ],
    });
  };

  const items = await withBrowser(fetchImpl, () => impl.listNativeLibrary({ kind: 'image', limit: 2 }));
  await withBrowser(fetchImpl, () => impl.deleteNativeLibraryItem('job-1'));

  assert.equal(items.length, 1);
  assert.equal(calls[0].url, '/api/native-media/v1/library?kind=image&limit=2');
  assert.equal(calls[0].opts.headers.Accept, 'application/json');
  assert.equal(calls[1].url, '/api/native-media/v1/library/job-1');
  assert.equal(calls[1].opts.method, 'DELETE');
  assert.ok(!calls[1].url.includes('asset-1'), 'client delete must not key requests by assetId');
});

const STUDIO_STATIC_CASES = [
  {
    name: 'ImageStudio',
    file: 'packages/studio/src/components/ImageStudio.jsx',
    kind: 'image',
    failureLog: 'Failed to delete ImageStudio library item:',
  },
  {
    name: 'VideoStudio',
    file: 'packages/studio/src/components/VideoStudio.jsx',
    kind: 'video',
    failureLog: 'Failed to delete VideoStudio library item:',
  },
];

for (const { name, file, kind, failureLog } of STUDIO_STATIC_CASES) {
  test(`${name} wires native hydration, de-dupe, copy prompt, confirm-delete, and local-only delete`, () => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    const count = (needle) => source.split(needle).length - 1;

    assert.ok(
      source.includes(`listNativeLibrary({ kind: "${kind}", limit: 50 })`),
      `${name} must hydrate native ${kind} history from the server library`
    );
    assert.ok(count('mergeServerHistory(') > 1, `${name} server hydration must de-dupe against local history`);
    assert.ok(/listNativeLibrary\([^)]*\)[\s\S]*\.catch\(/.test(source), 'server-down library load must fall back to local history');
    assert.ok(count('copyPromptToClipboard(') > 1, `${name} history cards must expose prompt copy`);
    assert.ok(
      source.includes('confirm("Delete this generation from the interface and server? This cannot be undone.")'),
      `${name} native server delete must require the accepted confirmation text`
    );
    assert.ok(count('deleteNativeLibraryItem(') > 0, `${name} native server-backed cards must call the delete API`);
    assert.ok(source.includes(`console.warn("${failureLog}", err);`), `${name} must log failed server deletes`);
    assert.ok(/catch\s*\([^)]*\)\s*{[^}]*setLocalHistory/.test(source) === false, `${name} failed server delete must not remove the card`);
    assert.ok(
      /if\s*\(entry\?\.serverBacked && jobId\)\s*{/.test(source),
      `${name} must avoid server delete for local-only history entries`
    );
    assert.ok(/serverBacked/.test(source), `${name} must distinguish server-backed from local-only entries`);
  });
}
