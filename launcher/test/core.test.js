const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { openStores } = require('../src/core/store');
const { Library } = require('../src/core/library');
const { engines, detectEngine } = require('../src/engines');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tiko-'));

function makeLib() {
  const home = tmp();
  return new Library(openStores(home));
}

function makeZip() {
  const z = new AdmZip();
  z.addFile('model/chair.fbx', Buffer.from('fbx'));
  z.addFile('model/chair.glb', Buffer.from('glb'));
  z.addFile('model/tex/diffuse.png', Buffer.from('png'));
  const f = path.join(tmp(), 'Cool Chair.zip');
  z.writeZip(f);
  return f;
}

test('addFromPath extracts zip and indexes model formats', () => {
  const lib = makeLib();
  const a = lib.addFromPath(makeZip());
  assert.deepStrictEqual(a.files.map(f => f.format).sort(), ['fbx', 'glb']);
  assert.ok(a.downloaded);
  assert.strictEqual(lib.list().length, 1);
});

test('library persists across reopen', () => {
  const home = tmp();
  new Library(openStores(home)).addFromPath(makeZip());
  assert.strictEqual(new Library(openStores(home)).list().length, 1);
});

test('project detection', () => {
  const u = tmp(); fs.mkdirSync(path.join(u, 'ProjectSettings')); fs.writeFileSync(path.join(u, 'ProjectSettings', 'ProjectVersion.txt'), 'x');
  const g = tmp(); fs.writeFileSync(path.join(g, 'project.godot'), '');
  const r = tmp(); fs.writeFileSync(path.join(r, 'Game.uproject'), '{}');
  const b = path.join(tmp(), 's.blend'); fs.writeFileSync(b, '');
  assert.deepStrictEqual([u, g, r, b].map(p => detectEngine(p).id), ['unity', 'godot', 'unreal', 'blender']);
});

test('unity and godot import copy asset into project', async () => {
  const lib = makeLib();
  const a = lib.addFromPath(makeZip());
  const u = tmp(); const g = tmp();
  await engines.unity.importAsset({ asset: a, project: { path: u }, config: {} });
  await engines.godot.importAsset({ asset: a, project: { path: g }, config: {} });
  assert.ok(fs.existsSync(path.join(u, 'Assets/TikoAssets/Cool_Chair/model/chair.fbx')));
  assert.ok(fs.existsSync(path.join(g, 'assets/Cool_Chair/model/tex/diffuse.png')));
});

test('unreal stages import script without editor configured', async () => {
  const lib = makeLib();
  const a = lib.addFromPath(makeZip());
  const r = tmp(); fs.writeFileSync(path.join(r, 'G.uproject'), '{}');
  const msg = await engines.unreal.importAsset({ asset: a, project: { path: r }, config: {} });
  assert.match(msg, /Staged/);
  assert.ok(fs.existsSync(path.join(r, 'Saved/TikoImport/Cool_Chair/_import.py')));
});

test('setTags normalizes and dedupes', () => {
  const lib = makeLib();
  const a = lib.addFromPath(makeZip());
  assert.deepStrictEqual(lib.setTags(a.id, [' Furniture', 'furniture', 'PBR', '']).tags, ['furniture', 'pbr']);
});

test('explicit format choice picks that file for Unreal import', async () => {
  const lib = makeLib();
  const a = lib.addFromPath(makeZip()); // contains chair.fbx and chair.glb; fbx is Unreal's default
  const r = tmp(); fs.writeFileSync(path.join(r, 'G.uproject'), '{}');
  await engines.unreal.importAsset({ asset: a, project: { path: r }, config: {}, format: 'glb' });
  const py = fs.readFileSync(path.join(r, 'Saved/TikoImport/Cool_Chair/_import.py'), 'utf8');
  assert.match(py, /chair\.glb/);
  await assert.rejects(engines.unreal.importAsset({ asset: a, project: { path: r }, config: {}, format: 'obj' }), /No model format/);
});

test('moveTo relocates assets, rewrites paths, and keeps files servable', async () => {
  const lib = makeLib();
  const a = lib.addFromPath(makeZip());
  const oldDir = a.dir;
  const target = path.join(tmp(), 'bigdrive');
  assert.strictEqual(await lib.moveTo(target), 1);
  const b = lib.get(a.id);
  assert.ok(b.dir.startsWith(fs.realpathSync(path.dirname(target)) ) || b.dir.startsWith(target));
  assert.ok(b.files.every(f => fs.existsSync(f.path) && f.path.startsWith(target)));
  assert.ok(!fs.existsSync(oldDir));
  assert.ok(lib.isServable(b.files[0].path));
  assert.ok(!lib.isServable('/etc/passwd'));
  assert.strictEqual(lib.stores.assetsDir, target);
  assert.ok(lib.dirFor('x', 'y').startsWith(target));
  await assert.rejects(lib.moveTo(path.join(target, 'inside')), /not inside/);
});
