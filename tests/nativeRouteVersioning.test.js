'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = () =>
  fs.readFileSync(
    path.join(process.cwd(), 'app/api/native-media/[[...path]]/route.js'),
    'utf8'
  );

const serverSource = () =>
  fs.readFileSync(
    path.join(process.cwd(), 'native-media-gateway/server.js'),
    'utf8'
  );

const lastFrameHelperSource = () =>
  fs.readFileSync(
    path.join(process.cwd(), 'native-media-gateway/bin/extract-last-frame.js'),
    'utf8'
  );

test('native media route is a loopback proxy and does not import the gateway', () => {
  const source = routeSource();
  assert.match(source, /NATIVE_MEDIA_GATEWAY_URL/);
  assert.match(source, /http:\/\/127\.0\.0\.1:19334/);
  assert.match(source, /fetch\(targetUrl\(request\),\s*init\)/);
  assert.doesNotMatch(source, /native-media-gateway\/exports\.js/);
  assert.doesNotMatch(source, /submitGeneration|uploadAsset|getGeneration|getAsset|cancelGeneration/);
});

test('native media worker keeps versioned and unversioned resources on the existing handlers', () => {
  const source = serverSource();
  assert.match(source, /path\[0\]\s*===\s*['"]v1['"]\s*\?\s*path\.slice\(1\)\s*:\s*path/);
  for (const resource of ['health', 'ready', 'capabilities', 'uploads', 'generations', 'assets']) {
    assert.match(source, new RegExp(`resource\\s*===\\s*['"]${resource}['"]`));
  }
});

test('native media worker can enable live providers from env gates', () => {
  const source = serverSource();
  assert.match(source, /process\.env\.NATIVE_MEDIA_LIVE_VERTEX\s*===\s*['"]1['"]/);
  assert.match(source, /process\.env\.NATIVE_MEDIA_LIVE_CODEX\s*===\s*['"]1['"]/);
  assert.match(source, /process\.env\.NATIVE_MEDIA_LIVE_GROK\s*===\s*['"]1['"]/);
  assert.match(source, /process\.env\.NATIVE_MEDIA_LIVE_OMNI\s*===\s*['"]1['"]/);
  assert.match(source, /gateway\.providerFor\(request(?:\s*&&\s*typeof request === ['"]object['"][^?]+)?\s*\?\s*request\.modelId\s*:\s*null\)/s);
  assert.match(source, /real provider unavailable for native generation/);
  assert.match(source, /provider:\s*\{\s*fake:\s*\(isImage\s*\|\|\s*isOmni\)\s*\?\s*false\s*:\s*!real\s*\}/);
  assert.match(source, /gateway\.submitGeneration\(body,\s*generationOptions\(body\)\)/);
  assert.match(source, /gateway\.reconcileOnRestart\(\)/);
});

test('native media last-frame helper uses fixed ffprobe and ffmpeg argv without a shell', () => {
  const source = lastFrameHelperSource();
  assert.match(source, /spawnChild\(command,\s*args,\s*\{\s*shell:\s*false/);
  assert.match(source, /process\.once\('SIGTERM',\s*handleExitSignal\)/);
  assert.match(source, /killActiveChild\(signal\)/);
  assert.match(source, /killActiveChild\('SIGKILL'\)/);
  assert.match(source, /run\('ffprobe',\s*\[/);
  assert.match(source, /'-count_frames'/);
  assert.match(source, /'stream=nb_read_frames'/);
  assert.match(source, /run\('ffmpeg',\s*\[/);
  assert.match(source, /'-vf',\s*`select=eq\(n\\\\,/);
  assert.match(source, /'-frames:v',\s*'1'/);
});

test('native media last-frame helper cleanup kills the active subprocess', async () => {
  const helper = require(path.join(process.cwd(), 'native-media-gateway/bin/extract-last-frame.js'));
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  const killed = [];
  child.kill = (signal) => {
    child.killed = true;
    killed.push(signal);
    return true;
  };

  const pending = helper._test.run('ffprobe', ['-v', 'error'], {
    spawn(command, args, options) {
      assert.equal(command, 'ffprobe');
      assert.deepEqual(args, ['-v', 'error']);
      assert.equal(options.shell, false);
      return child;
    },
  }).catch((error) => error);

  helper._test.killActiveChild('SIGTERM');
  child.emit('close', 143);

  assert.deepEqual(killed, ['SIGTERM']);
  assert.match((await pending).message, /ffprobe failed/);
});

test('route proxy forwarding executability', async (t) => {
  const { pathToFileURL } = require('node:url');
  const routePath = path.join(process.cwd(), 'app/api/native-media/[[...path]]/route.js');
  const routeModule = await import(pathToFileURL(routePath).href);

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let calledUrl = null;
  let calledInit = null;

  globalThis.fetch = async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(JSON.stringify({ forwarded: true }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Normal': 'res-ok',
        'Cookie': 'ignore-me'
      }
    });
  };

  const reqHeaders = new Headers({
    'Content-Type': 'application/json',
    'Host': 'localhost:3000',
    'Connection': 'keep-alive',
    'Cookie': 'foo=bar',
    'Authorization': 'Bearer token',
    'X-Api-Key': 'some-key',
    'X-Normal-Header': 'hello-world'
  });

  const request = new Request('http://localhost:3000/api/native-media/v1/assets/asset-123?foo=bar', {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify({ prompt: 'test' }),
    duplex: 'half'
  });

  const response = await routeModule.POST(request);

  // Assert target URL mapping
  assert.ok(calledUrl);
  assert.equal(calledUrl.href, 'http://127.0.0.1:19334/api/native-media/v1/assets/asset-123?foo=bar');

  // Assert method and body forwarding
  assert.equal(calledInit.method, 'POST');
  assert.equal(await new Response(calledInit.body).text(), JSON.stringify({ prompt: 'test' }));

  // Assert header preservation and stripping
  const sentHeaders = calledInit.headers;
  assert.equal(sentHeaders.get('content-type'), 'application/json');
  assert.equal(sentHeaders.get('x-normal-header'), 'hello-world');
  assert.equal(sentHeaders.has('host'), false);
  assert.equal(sentHeaders.has('connection'), false);
  assert.equal(sentHeaders.has('cookie'), false);
  assert.equal(sentHeaders.has('authorization'), false);
  assert.equal(sentHeaders.has('x-api-key'), false);

  // Assert response metadata is preserved/mapped
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('x-response-normal'), 'res-ok');
  assert.equal(response.headers.has('cookie'), false);
});
