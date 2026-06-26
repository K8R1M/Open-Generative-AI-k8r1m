const test = require('node:test');
const assert = require('node:assert/strict');

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

async function withMockedBrowserFetch(fetchImpl, fn) {
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

test('generateNativeMedia polls pending native jobs and returns completed same-origin asset URL', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'I1 native client polling');
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (calls.length === 1) {
      assert.equal(url, '/api/native-media/v1/generations');
      return response({ id: 'job-1', status: 'queued' });
    }
    assert.equal(url, '/api/native-media/v1/generations/job-1');
    return response({
      id: 'job-1',
      status: 'completed',
      assetId: 'asset-1',
      model: 'native.vertex.nano-banana-2',
    });
  };

  const result = await withMockedBrowserFetch(fetchImpl, () =>
    impl.generateNativeMedia({
      modelId: 'native.vertex.nano-banana-2',
      task: 'text-to-image',
      prompt: 'x',
      clientRequestId: 'req-1',
      pollIntervalMs: 0,
      pollTimeoutMs: 50,
    })
  );

  assert.equal(calls.length, 2);
  assert.equal(result.status, 'completed');
  assert.equal(result.url, '/api/native-media/v1/assets/asset-1');
  assert.deepEqual(result.outputs, ['/api/native-media/v1/assets/asset-1']);
});

test('generateNativeMedia throws clear terminal errors for native terminal statuses while polling', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'I1 native client polling');
  const cases = [
    ['failed', /failed.*terminal failed/i],
    ['cancelled', /cancelled.*terminal cancelled/i],
    ['INTERRUPTED_PROCESS', /interrupted_process.*terminal interrupted_process/i],
    ['OUTCOME_UNKNOWN', /outcome_unknown.*terminal outcome_unknown/i],
    ['ASSET_UNAVAILABLE', /asset_unavailable.*terminal asset_unavailable/i],
  ];

  for (const [status, pattern] of cases) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) return response({ id: `job-${status}`, status: 'running' });
      return response({ id: `job-${status}`, status, error: `terminal ${status}` });
    };

    await assert.rejects(
      () =>
        withMockedBrowserFetch(fetchImpl, () =>
          impl.generateNativeMedia({
            modelId: 'native.vertex.nano-banana-2',
            task: 'text-to-image',
            prompt: 'x',
            clientRequestId: `req-${status}`,
            pollIntervalMs: 0,
            pollTimeoutMs: 50,
          })
        ),
      pattern
    );
    assert.equal(calls, 2, `${status} should stop after the terminal poll`);
  }
});

test('generateNativeMedia times out bounded native polling', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'I1 native client polling');
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response({ id: 'job-3', status: 'running' });
  };

  await assert.rejects(
    () =>
      withMockedBrowserFetch(fetchImpl, () =>
        impl.generateNativeMedia({
          modelId: 'native.vertex.nano-banana-2',
          task: 'text-to-image',
          prompt: 'x',
          clientRequestId: 'req-3',
          pollIntervalMs: 50,
          pollTimeoutMs: 1,
        })
      ),
    /timed out/i
  );
  assert.equal(calls, 1, 'timeout should not perform an extra poll after the deadline');
});

test('native client default poll timeout is longer than legacy two-minute ceiling', async () => {
  const impl = await loadNative('packages/studio/src/nativeMedia.js', 'I1 native client polling');
  let calls = 0;
  const realDateNow = Date.now;
  const fetchImpl = async () => {
    calls += 1;
    return response({ id: 'job-default-timeout', status: 'running' });
  };

  let now = 0;
  Date.now = () => {
    if (calls <= 1) return now;
    if (calls === 2) {
      now = 120001;
      return now;
    }
    now = 600001;
    return now;
  };

  try {
    await assert.rejects(
      () =>
        withMockedBrowserFetch(fetchImpl, () =>
          impl.generateNativeMedia({
            modelId: 'native.vertex.nano-banana-2',
            task: 'text-to-image',
            prompt: 'x',
            clientRequestId: 'req-default-timeout',
            pollIntervalMs: 0,
          })
        ),
      /timed out after 440000ms/i
    );
  } finally {
    Date.now = realDateNow;
  }

  assert.equal(calls, 3, 'default timeout should permit polling past 120000ms before expiring');
});
