const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(process.cwd(), 'packages/studio/src/components/VideoStudio.jsx'),
  'utf8',
);

function extractFunction(name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} should be exported`);
  const bodyStart = source.indexOf('{\n', source.indexOf(') ', start));
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, i + 1).replace('export function', 'function');
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function loadPlanner() {
  const sandbox = {
    NATIVE_MODELS: [
      {
        id: 'native.vertex.gemini-omni-flash-preview',
        label: 'Gemini Omni Flash Preview (Server · Vertex AI)',
        kind: 'video',
        tasks: ['text-to-video', 'image-to-video'],
        maxReferenceImages: 10,
      },
      {
        id: 'native.grok.imagine-video',
        label: 'Grok Imagine 1.5 (server-native)',
        kind: 'video',
        tasks: ['image-to-video'],
        maxReferenceImages: 6,
      },
      {
        id: 'native.vertex.veo-3.1',
        label: 'Veo 3.1 (Server · Vertex AI)',
        kind: 'video',
        provider: 'vertex',
        tasks: ['text-to-video', 'image-to-video'],
        maxReferenceImages: 3,
        referenceImagesEnabled: true,
      },
    ],
    nativeModelById(id) {
      return sandbox.NATIVE_MODELS.find((model) => model.id === id) || null;
    },
    isSameOriginAssetUrl(value) {
      return typeof value === 'string' && value.startsWith('/api/native-media/v1/assets/');
    },
    getMaxImagesForI2VNative(id) {
      const model = sandbox.nativeModelById(id);
      return 1 + (model?.maxReferenceImages || 0);
    },
    NATIVE_VEO_REFERENCE_IMAGES_ENABLED: true,
    isVeoReferenceModel(model) {
      return model?.provider === 'vertex' && model.referenceImagesEnabled && sandbox.NATIVE_VEO_REFERENCE_IMAGES_ENABLED;
    },
    getMaxImagesForVideoInputMode(id, mode = 'frames') {
      const model = sandbox.nativeModelById(id);
      if (sandbox.isVeoReferenceModel(model)) return mode === 'references' ? 3 : 1;
      return sandbox.getMaxImagesForI2VNative(id);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${extractFunction('planReferenceHandoff')}; this.planReferenceHandoff = planReferenceHandoff;`, sandbox);
  return sandbox.planReferenceHandoff;
}

const planReferenceHandoff = loadPlanner();
const plain = (value) => JSON.parse(JSON.stringify(value));

test('planReferenceHandoff keeps a compatible current model', () => {
  const plan = planReferenceHandoff({
    urls: ['/api/native-media/v1/assets/asset-a'],
    currentModelId: 'native.vertex.gemini-omni-flash-preview',
  });
  assert.equal(plan.modelId, 'native.vertex.gemini-omni-flash-preview');
  assert.equal(plan.modelName, 'Gemini Omni Flash Preview (Server · Vertex AI)');
  assert.equal(plan.imageMode, true);
  assert.deepEqual(plain(plan.urls), ['/api/native-media/v1/assets/asset-a']);
});

test('planReferenceHandoff never retargets and trims to current model capacity', () => {
  const plan = planReferenceHandoff({
    urls: ['/api/native-media/v1/assets/asset-a', '/api/native-media/v1/assets/asset-b'],
    currentModelId: 'native.grok.imagine-video',
  });
  assert.equal(plan.modelId, 'native.grok.imagine-video');
  assert.deepEqual(plain(plan.urls), ['/api/native-media/v1/assets/asset-a', '/api/native-media/v1/assets/asset-b']);
  assert.deepEqual(plain(plan.warnings), []);
});

test('planReferenceHandoff reports kept count when current model capacity trims refs', () => {
  const plan = planReferenceHandoff({
    urls: ['/api/native-media/v1/assets/asset-a', '/api/native-media/v1/assets/asset-b'],
    currentModelId: 'native.vertex.nano-banana-2',
  });
  assert.equal(plan.modelId, 'native.vertex.nano-banana-2');
  assert.deepEqual(plain(plan.urls), ['/api/native-media/v1/assets/asset-a']);
  assert.deepEqual(plain(plan.warnings), ['kept:1-of-2']);
});

test('planReferenceHandoff never bounces Veo to another model and caps frames-mode handoff at 1', () => {
  const plan = planReferenceHandoff({
    urls: ['/api/native-media/v1/assets/asset-a', '/api/native-media/v1/assets/asset-b'],
    currentModelId: 'native.vertex.veo-3.1',
  });
  assert.equal(plan.modelId, 'native.vertex.veo-3.1');
  assert.deepEqual(plain(plan.urls), ['/api/native-media/v1/assets/asset-a']);
  assert.deepEqual(plain(plan.warnings), ['kept:1-of-2']);
});

test('planReferenceHandoff reports unusable urls without a state plan', () => {
  const plan = planReferenceHandoff({
    urls: ['https://example.test/image.png'],
    currentModelId: 'native.vertex.gemini-omni-flash-preview',
  });
  assert.deepEqual(plain(plan), { warnings: ['no-usable-urls'] });
});
