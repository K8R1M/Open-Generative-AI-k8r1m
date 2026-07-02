#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

let activeChild = null;
let exiting = false;

function killActiveChild(signal = 'SIGTERM') {
  if (activeChild && !activeChild.killed) activeChild.kill(signal);
}

function exitCodeForSignal(signal) {
  return signal === 'SIGINT' ? 130 : 143;
}

function handleExitSignal(signal) {
  if (exiting) return;
  exiting = true;
  killActiveChild(signal);
  const force = setTimeout(() => killActiveChild('SIGKILL'), 1000);
  const exit = setTimeout(() => process.exit(exitCodeForSignal(signal)), 1500);
  force.unref?.();
  exit.unref?.();
}

function installSignalCleanup() {
  process.once('SIGTERM', handleExitSignal);
  process.once('SIGINT', handleExitSignal);
}

function run(command, args, options = {}) {
  const spawnChild = options.spawn || spawn;
  return new Promise((resolve, reject) => {
    const child = spawnChild(command, args, { shell: false, windowsHide: true });
    activeChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (activeChild === child) activeChild = null;
      reject(error);
    });
    child.on('close', (code) => {
      if (activeChild === child) activeChild = null;
      if (code === 0) return resolve(stdout);
      const error = new Error(`${command} failed`);
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function frameCount(videoPath) {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=nb_read_frames',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]);
  const count = Number.parseInt(out.trim(), 10);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('no video frames found');
  return count;
}

async function extractLastFrame(videoPath, outputPath) {
  const source = path.resolve(videoPath);
  const output = path.resolve(outputPath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const lastIndex = await frameCount(source) - 1;
  await run('ffmpeg', [
    '-v', 'error',
    '-nostdin',
    '-i', source,
    '-vf', `select=eq(n\\,${lastIndex})`,
    '-vsync', '0',
    '-frames:v', '1',
    '-f', 'image2',
    '-y', output,
  ]);
}

if (require.main === module) {
  installSignalCleanup();
  const [videoPath, outputPath] = process.argv.slice(2);
  if (!videoPath || !outputPath || process.argv.length !== 4) {
    console.error('usage: extract-last-frame.js <video-path> <output-png>');
    process.exit(64);
  }
  extractLastFrame(videoPath, outputPath).catch(() => {
    console.error('last frame extraction failed');
    process.exit(1);
  });
}

module.exports = { extractLastFrame, _test: { run, killActiveChild, handleExitSignal } };
