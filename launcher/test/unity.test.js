const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openStores } = require('../src/core/store');
const { Library } = require('../src/core/library');
const { scanUnityCache } = require('../src/core/unityCache');

test('scans Unity Asset Store cache once, without duplicating', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-'));
  fs.mkdirSync(path.join(root, 'Synty Studios', '3D Models'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Synty Studios', '3D Models', 'POLYGON Fantasy.unitypackage'), 'p');
  fs.writeFileSync(path.join(root, 'readme.txt'), 'x');
  const lib = new Library(openStores(fs.mkdtempSync(path.join(os.tmpdir(), 'tiko-'))));
  assert.strictEqual(scanUnityCache(lib, [root]), 1);
  assert.strictEqual(scanUnityCache(lib, [root]), 0);
  const a = lib.list()[0];
  assert.deepStrictEqual([a.title, a.author, a.provider, a.files.map(f => f.format)], ['POLYGON Fantasy', 'Synty Studios', 'unity', ['unitypackage']]);
});
