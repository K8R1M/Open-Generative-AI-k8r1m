'use strict';

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const gateway = require('./exports.js');
const { runLastFrameHelper } = require('./frames.js');

function frameExtractionError() {
  const error = new Error('Could not extract last frame.');
  error.nativeMediaStatus = 500;
  error.nativeMediaBody = { error: 'FRAME_EXTRACTION_FAILED', message: 'Could not extract last frame.' };
  return error;
}

function isPng(bytes) {
  return Buffer.isBuffer(bytes) &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
}

async function frameFromJob(body) {
  const jobId = body && body.jobId;
  const resolved = await gateway.resolveLibraryVideoAsset(jobId);
  if (!resolved) return null;

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'native-last-frame-'));
  const outputPath = path.join(tempDir, `${crypto.randomUUID()}.png`);
  try {
    await runLastFrameHelper(resolved.asset.path, outputPath);
    const bytes = await fsp.readFile(outputPath);
    if (!isPng(bytes)) throw frameExtractionError();
    const saved = await gateway.saveDerivedFrameAsset(bytes, { jobId });
    return { assetId: saved.assetId, url: saved.url, mime: saved.mime };
  } catch (error) {
    if (error && error.nativeMediaBody) throw error;
    throw frameExtractionError();
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  frameFromJob,
};
