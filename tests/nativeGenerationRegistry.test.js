'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const registryUrl = pathToFileURL(path.join(repoRoot, 'packages/studio/src/generationRegistry.js')).href;

function response(body, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : status === 404 ? 'Not Found' : 'ERR',
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function makeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

async function loadRegistry({ fetchImpl, storage = makeLocalStorage() } = {}) {
  const oldFetch = global.fetch;
  const oldLocalStorage = global.localStorage;
  global.fetch = fetchImpl || (async () => response({ status: 'completed', assetId: 'asset-default' }));
  global.localStorage = storage;
  const mod = await import(`${registryUrl}?case=${Date.now()}-${Math.random()}`);
  return {
    mod,
    storage,
    restore() {
      global.fetch = oldFetch;
      global.localStorage = oldLocalStorage;
    },
  };
}

async function waitFor(fn, timeout = 500) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (last) throw last;
  assert.fail('timed out waiting for condition');
}

test('track resolves pending jobs into undelivered entries and consume removes them', async () => {
  const loaded = await loadRegistry({
    fetchImpl: async () => response({
      id: 'job-1',
      status: 'completed',
      model: 'native.vertex.veo-3.1-fast',
      assetId: 'asset-1',
      parameters: { durationSeconds: 8, resolution: '720p', aspectRatio: '16:9' },
    }),
  });
  try {
    loaded.mod.track({ id: 'job-1', modelId: 'native.vertex.veo-3.1-fast', pollIntervalMs: 0 }, {
      studio: 'video',
      prompt: 'make it move',
      displayName: 'clip',
    });

    await waitFor(() => loaded.mod.consume('video').length === 1);
    const again = loaded.mod.consume('video');
    assert.deepEqual(again, []);
  } finally {
    loaded.restore();
  }
});

test('track is idempotent per job id', async () => {
  let polls = 0;
  const loaded = await loadRegistry({
    fetchImpl: async () => {
      polls += 1;
      return response({ id: 'job-idem', status: 'completed', assetId: 'asset-idem' });
    },
  });
  try {
    const job = { id: 'job-idem', modelId: 'native.vertex.nano-banana-2', pollIntervalMs: 0 };
    loaded.mod.track(job, { studio: 'image', prompt: 'one' });
    loaded.mod.track(job, { studio: 'image', prompt: 'one' });

    await waitFor(() => loaded.mod.consume('image').length === 1);
    assert.equal(polls, 1);
  } finally {
    loaded.restore();
  }
});

test('settle removes pending and undelivered jobs', async () => {
  const loaded = await loadRegistry({
    fetchImpl: async () => response({ id: 'job-settle', status: 'completed', assetId: 'asset-settle' }),
  });
  try {
    loaded.mod.track({ id: 'job-settle', modelId: 'native.vertex.nano-banana-2', pollIntervalMs: 25 }, {
      studio: 'image',
      prompt: 'settle me',
    });
    assert.equal(loaded.mod.pendingFor('image').length, 1);
    loaded.mod.settle('job-settle');
    assert.equal(loaded.mod.pendingFor('image').length, 0);
    assert.deepEqual(loaded.mod.consume('image'), []);
  } finally {
    loaded.restore();
  }
});

test('settle suppresses an already-running registry poll result', async () => {
  let resolveFetch;
  const fetched = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const loaded = await loadRegistry({
    fetchImpl: async () => fetched,
  });
  try {
    loaded.mod.track({ id: 'job-late-settle', modelId: 'native.vertex.nano-banana-2', pollIntervalMs: 0 }, {
      studio: 'image',
      prompt: 'late settle',
    });
    assert.equal(loaded.mod.pendingFor('image').length, 1);
    loaded.mod.settle('job-late-settle');
    resolveFetch(response({ id: 'job-late-settle', status: 'completed', assetId: 'asset-late' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(loaded.mod.pendingFor('image').length, 0);
    assert.deepEqual(loaded.mod.consume('image'), []);
  } finally {
    loaded.restore();
  }
});

test('localStorage round-trip rehydrates pending and resumeAll re-polls', async () => {
  let polls = 0;
  const storage = makeLocalStorage({
    native_generation_registry_v1: JSON.stringify({
      pending: [['job-stored', {
        jobId: 'job-stored',
        studio: 'video',
        modelId: 'native.vertex.veo-3.1-fast',
        prompt: 'stored prompt',
        displayName: 'stored clip',
        createdAt: 1,
        pollIntervalMs: 0,
      }]],
      undelivered: [],
    }),
  });
  const loaded = await loadRegistry({
    storage,
    fetchImpl: async () => {
      polls += 1;
      return response({ id: 'job-stored', status: 'completed', assetId: 'asset-stored' });
    },
  });
  try {
    await waitFor(() => loaded.mod.consume('video').length === 1);
    assert.equal(polls, 1);
    const stored = JSON.parse(storage.dump().native_generation_registry_v1);
    assert.deepEqual(stored.pending, []);
  } finally {
    loaded.restore();
  }
});

test('resume drops 404 pending jobs silently', async () => {
  const storage = makeLocalStorage({
    native_generation_registry_v1: JSON.stringify({
      pending: [['job-gone', {
        jobId: 'job-gone',
        studio: 'image',
        modelId: 'native.vertex.nano-banana-2',
        prompt: 'gone',
        createdAt: 1,
        pollIntervalMs: 0,
      }]],
      undelivered: [],
    }),
  });
  const loaded = await loadRegistry({
    storage,
    fetchImpl: async () => response({ error: 'missing' }, false, 404),
  });
  try {
    await waitFor(() => loaded.mod.pendingFor('image').length === 0);
    assert.deepEqual(loaded.mod.consume('image'), []);
  } finally {
    loaded.restore();
  }
});

test('failed jobs queue only for video', async () => {
  const loaded = await loadRegistry({
    fetchImpl: async (url) => response({
      id: String(url).split('/').pop(),
      status: 'failed',
      error: 'provider failed',
    }),
  });
  try {
    loaded.mod.track({ id: 'job-video-fail', modelId: 'native.vertex.veo-3.1-fast', pollIntervalMs: 0 }, {
      studio: 'video',
      prompt: 'fail video',
    });
    loaded.mod.track({ id: 'job-image-fail', modelId: 'native.vertex.nano-banana-2', pollIntervalMs: 0 }, {
      studio: 'image',
      prompt: 'fail image',
    });

    const video = await waitFor(() => {
      const entries = loaded.mod.consume('video');
      return entries.length ? entries : null;
    });
    assert.equal(video[0].status, 'failed');
    assert.match(video[0].error, /provider failed/);
    await waitFor(() => loaded.mod.pendingFor('image').length === 0);
    assert.deepEqual(loaded.mod.consume('image'), []);
  } finally {
    loaded.restore();
  }
});
