'use strict';

const path = require('node:path');
const childProcess = require('node:child_process');

async function runLastFrameHelper(inputPath, outputPath) {
  const helper = path.join(__dirname, 'bin', 'extract-last-frame.js');
  await new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [helper, inputPath, outputPath], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('last frame extraction timed out'));
    }, 30000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('last frame extraction failed'));
    });
  });
}

module.exports = {
  runLastFrameHelper,
};
