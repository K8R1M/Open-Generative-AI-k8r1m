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
  assert.equal(items[0].prompt, 'copy me');
  assert.equal(calls[0].url, '/api/native-media/v1/library?kind=image&limit=2');
  assert.equal(calls[0].opts.headers.Accept, 'application/json');
  assert.equal(calls[1].url, '/api/native-media/v1/library/job-1');
  assert.equal(calls[1].opts.method, 'DELETE');
  assert.ok(!calls[1].url.includes('asset-1'), 'client delete must not key requests by assetId');
});

test('native generation request and result preserve display/download metadata', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'native display metadata client');
  const request = impl.buildNativeRequest({
    modelId: 'native.vertex.nano-banana-2',
    task: 'text-to-image',
    prompt: 'named image',
    displayName: 'image-studio-0001',
  });
  assert.equal(request.displayName, 'image-studio-0001');

  const result = impl.normalizeNativeResult({
    id: 'job-1',
    status: 'completed',
    model: 'native.vertex.nano-banana-2',
    assetId: 'asset-1',
    displayName: 'image-studio-0001',
    downloadName: 'image-studio-0001',
  });
  assert.equal(result.displayName, 'image-studio-0001');
});

test('native library client posts last-frame route and downloads returned png attachment', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'native library last-frame client');
  const oldDocument = global.document;
  const oldUrl = global.URL;
  const calls = [];
  const clicked = [];
  const anchors = [];

  global.document = {
    body: {
      appendChild(node) {
        anchors.push(node);
      },
      removeChild() {},
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        href: '',
        download: '',
        click() {
          clicked.push({ href: this.href, download: this.download });
        },
      };
    },
  };
  global.URL = {
    createObjectURL(blob) {
      assert.equal(blob.type, 'image/png');
      return 'blob:last-frame';
    },
    revokeObjectURL(url) {
      assert.equal(url, 'blob:last-frame');
    },
  };

  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get(name) {
          return name.toLowerCase() === 'content-disposition'
            ? 'attachment; filename="job-video-last-frame.png"'
            : null;
        },
      },
      async blob() {
        return new Blob(['png'], { type: 'image/png' });
      },
      async text() {
        return '';
      },
    };
  };

  try {
    const result = await withBrowser(fetchImpl, () => impl.downloadNativeLibraryLastFrame('job-video'));
    assert.deepEqual(result, { filename: 'job-video-last-frame.png' });
    assert.equal(calls[0].url, '/api/native-media/v1/library/job-video/last-frame');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.headers.Accept, 'image/png');
    assert.equal(anchors.length, 1);
    assert.deepEqual(clicked[0], { href: 'blob:last-frame', download: 'job-video-last-frame.png' });
  } finally {
    global.document = oldDocument;
    global.URL = oldUrl;
  }
});

test('native image success without URL or asset is rejected and cannot be stored', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'native fake image success client');
  const fetchImpl = async () => response({
    id: 'job-empty',
    status: 'completed',
    model: 'native.vertex.nano-banana-2',
    outputs: [],
  });

  await assert.rejects(
    () =>
      withBrowser(fetchImpl, () =>
        impl.generateNativeMedia({
          modelId: 'native.vertex.nano-banana-2',
          task: 'text-to-image',
          prompt: 'blank card regression',
          clientRequestId: 'req-empty',
        })
      ),
    /ASSET_UNAVAILABLE|no same-origin asset URL/i
  );

  const source = fs.readFileSync(path.join(process.cwd(), 'packages/studio/src/components/ImageStudio.jsx'), 'utf8');
  assert.ok(source.includes('function isUsableGeneratedImageResult(res)'), 'ImageStudio must gate history inserts through a usable-result check');
  assert.ok(source.includes('if (isUsableGeneratedImageResult(res))'), 'ImageStudio must not store native results merely because an object returned');
  assert.ok(source.includes('isSameOriginAssetUrl(res.url)'), 'native image history entries must require a same-origin asset URL');
  assert.ok(source.includes('!res.error'), 'native image history entries must reject reported errors');
  assert.ok(source.includes('status.includes("unavailable")'), 'native image history entries must reject unavailable statuses');
});

test('native image non-2xx generation rejects before ImageStudio can add history', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'native non-2xx image client');
  const fetchImpl = async () => response({ error: 'provider down' }, false);

  await assert.rejects(
    () =>
      withBrowser(fetchImpl, () =>
        impl.generateNativeMedia({
          modelId: 'native.codex.gpt-image-2',
          task: 'text-to-image',
          prompt: 'do not store',
          clientRequestId: 'req-500',
        })
      ),
    /Native generation failed: 500 ERR/
  );

  const source = fs.readFileSync(path.join(process.cwd(), 'packages/studio/src/components/ImageStudio.jsx'), 'utf8');
  assert.ok(
    /try\s*{[\s\S]*generateNativeMedia\([\s\S]*results\.forEach[\s\S]*}\s*catch\s*\(e\)\s*{[\s\S]*setGenerateError/.test(source),
    'ImageStudio must keep native generation failures on the error path instead of adding history'
  );
});

test('native prompt copy uses exact text with textarea fallback and reports failure', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'native prompt copy client');
  const oldNavigator = global.navigator;
  const oldDocument = global.document;
  const oldAlert = global.alert;
  const nodes = [];
  let copiedValue = null;
  let alertText = null;

  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => { throw new Error('insecure'); } } },
  });
  global.document = {
    body: {
      appendChild(node) {
        nodes.push(node);
      },
      removeChild() {},
    },
    createElement() {
      return {
        value: '',
        style: {},
        setAttribute() {},
        select() {
          copiedValue = this.value;
        },
      };
    },
    execCommand() {
      return true;
    },
  };

  try {
    assert.equal(await impl.copyPromptToClipboard('exact prompt'), true);
    assert.equal(copiedValue, 'exact prompt');

    global.document.execCommand = () => false;
    global.alert = (text) => {
      alertText = text;
    };
    assert.equal(await impl.copyPromptToClipboard('still exact'), false);
    assert.match(alertText, /Copy failed/);
    assert.ok(nodes.length >= 2);
  } finally {
    Object.defineProperty(global, 'navigator', { configurable: true, value: oldNavigator });
    global.document = oldDocument;
    global.alert = oldAlert;
  }
});

const STUDIO_STATIC_CASES = [
  {
    name: 'ImageStudio',
    file: 'packages/studio/src/components/ImageStudio.jsx',
    kind: 'image',
    prefix: 'image-studio',
    downloadHelper: 'imageDownloadName(entry, idx)',
    failureLog: 'Failed to delete ImageStudio library item:',
  },
  {
    name: 'VideoStudio',
    file: 'packages/studio/src/components/VideoStudio.jsx',
    kind: 'video',
    prefix: 'video-studio',
    downloadHelper: 'videoDownloadName(entry, idx)',
    failureLog: 'Failed to delete VideoStudio library item:',
  },
];

for (const { name, file, kind, prefix, downloadHelper, failureLog } of STUDIO_STATIC_CASES) {
  test(`${name} wires native hydration, de-dupe, copy prompt, confirm-delete, and local-only delete`, () => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    const historySource = fs.readFileSync(path.join(process.cwd(), 'packages/studio/src/studioHistory.js'), 'utf8');
    const combinedSource = `${source}\n${historySource}`;
    const count = (needle) => source.split(needle).length - 1;

    assert.ok(
      source.includes(`listNativeLibrary({ kind: "${kind}", limit: 50 })`),
      `${name} must hydrate native ${kind} history from the server library`
    );
    assert.ok(count('mergeServerHistory(') > 1, `${name} server hydration must de-dupe against local history`);
    assert.ok(/listNativeLibrary\([^)]*\)[\s\S]*\.catch\(/.test(source), 'server-down library load must fall back to local history');
    assert.ok(source.includes('copyPromptToClipboard(entry.prompt);'), `${name} history cards must copy exact prompt text`);
    assert.ok(combinedSource.includes('prompt: item.prompt || ""'), `${name} server history mapping must preserve prompt`);
    assert.ok(combinedSource.includes('displayName: item.displayName || item.downloadName || item.filename'), `${name} server history mapping must preserve displayName`);
    assert.ok(source.includes(downloadHelper), `${name} downloads must use durable display/download metadata`);
    assert.ok(source.includes('nameSequence'), `${name} must persist sticky name suffix state`);
    assert.ok(source.includes('padStart(3, "0")'), `${name} must zero-pad sticky suffixes`);
    assert.ok(!source.includes('nameCounter'), `${name} must not keep dead nameCounter state`);
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

test('VideoStudio prunes stale native server-backed local video entries only after server hydration succeeds', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'packages/studio/src/components/VideoStudio.jsx'), 'utf8');
  assert.ok(
    /entry\?\.serverBacked && entry\?\.native && !historyKeys\(entry\)\.some\(\(key\) => serverKeys\.has\(key\)\)/.test(source),
    'VideoStudio must prune stale native server-backed local entries missing from server library'
  );
  assert.ok(
    /listNativeLibrary\(\{ kind: "video", limit: 50 \}\)[\s\S]*\.then\(\(items\) => \{[\s\S]*setLocalHistory/.test(source),
    'VideoStudio pruning must happen only on successful server library hydration'
  );
});
