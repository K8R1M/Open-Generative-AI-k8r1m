const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shellSource = fs.readFileSync(
  path.join(process.cwd(), 'components/StandaloneShell.js'),
  'utf8'
);

test('StandaloneShell writes generated image handoff and routes to destination studio', () => {
  assert.match(shellSource, /const \[referenceHandoffNonce, setReferenceHandoffNonce\] = useState\(0\)/);
  assert.match(shellSource, /const handleGeneratedImageReference = useCallback\(\(targetStudio, urls\) => \{/);
  assert.match(shellSource, /targetStudio === 'video'[\s\S]*'nativeGeneratedImageReference:video'[\s\S]*'nativeGeneratedImageReference:image'/);
  assert.match(shellSource, /const handoffId = typeof crypto !== 'undefined' && crypto\.randomUUID/);
  assert.match(shellSource, /sessionStorage\.setItem\(key, JSON\.stringify\(\{ urls, source: 'generated-image', handoffId \}\)\)/);
  assert.match(shellSource, /setReferenceHandoffNonce\(\(n\) => n \+ 1\)/);
  assert.match(shellSource, /router\.push\(`\/studio\/\$\{targetStudio\}`\)/);
  assert.match(shellSource, /onGeneratedImageReference=\{handleGeneratedImageReference\}/);
  assert.match(shellSource, /referenceHandoffNonce=\{referenceHandoffNonce\}/);
});
