const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');
const { openStores } = require('../src/core/store');
const { Library } = require('../src/core/library');
const { createBridge } = require('../src/core/bridge');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tiko-'));

async function setup() {
  const downloads = tmp();
  const library = new Library(openStores(tmp()));
  const events = [];
  const server = createBridge({ library, getToken: () => 'secret', downloadDirs: () => [fs.realpathSync(downloads)], onItems: (s, n) => events.push(['items', s, n]), onDownload: a => events.push(['dl', a.id]) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = (method, url, body, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { 'content-type': 'application/json', ...headers } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    req.on('error', reject); req.end(body && JSON.stringify(body));
  });
  return { downloads, library, events, call, close: () => server.close() };
}
const ok = { 'x-tiko-token': 'secret', origin: 'chrome-extension://abc' };

test('rejects missing token and web page origins', async () => {
  const s = await setup();
  assert.strictEqual((await s.call('GET', '/ping')).status, 401);
  assert.strictEqual((await s.call('GET', '/ping', null, { ...ok, origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await s.call('GET', '/ping', null, ok)).status, 200);
  s.close();
});

test('items are validated and added', async () => {
  const s = await setup();
  const r = await s.call('POST', '/items', { store: 'fab', pageUrl: 'https://www.fab.com/library', items: [
    { id: 'u1', title: 'Chair', thumbnail: 'https://cdn.x/c.jpg', author: 'A' },
    { id: 'u2', title: 'Bad', thumbnail: 'javascript:alert(1)' }, { title: 'no id' }, null
  ] }, ok);
  assert.strictEqual(r.body.added, 2);
  const a = s.library.get('fab:u1');
  assert.strictEqual(a.pageUrl, 'https://www.fab.com/listings/u1');
  assert.strictEqual(s.library.get('fab:u2').thumbnail, undefined);
  assert.strictEqual((await s.call('POST', '/items', { store: 'nope', items: [] }, ok)).status, 400);
  s.close();
});

test('download is ingested, merges into matching card, and refuses paths outside downloads', async () => {
  const s = await setup();
  await s.call('POST', '/items', { store: 'fab', items: [{ id: 'u1', title: 'Chair', thumbnail: 'https://cdn.x/c.jpg' }] }, ok);
  const z = new AdmZip(); z.addFile('chair.glb', Buffer.from('glb'));
  const file = path.join(s.downloads, 'chair.zip'); z.writeZip(file);
  const r = await s.call('POST', '/download', { store: 'fab', path: file, referrer: 'https://www.fab.com/listings/u1?x=1' }, ok);
  assert.strictEqual(r.body.id, 'fab:u1');
  assert.ok(s.library.get('fab:u1').downloaded);
  assert.deepStrictEqual(s.library.get('fab:u1').files.map(f => f.format), ['glb']);
  const outside = path.join(tmp(), 'x.zip'); fs.writeFileSync(outside, 'x');
  assert.strictEqual((await s.call('POST', '/download', { store: 'fab', path: outside }, ok)).status, 400);
  assert.strictEqual((await s.call('POST', '/download', { store: 'fab', path: '/etc/passwd' }, ok)).status, 400);
  s.close();
});

test('download with an unrelated referrer still merges into the single card whose title matches the file name', async () => {
  const s = await setup();
  await s.call('POST', '/items', { store: 'fab', items: [{ id: 'u1', title: 'Oak Chair', thumbnail: 'https://cdn.x/c.jpg' }, { id: 'u2', title: 'Table', thumbnail: 'https://cdn.x/t.jpg' }] }, ok);
  const z = new AdmZip(); z.addFile('m.glb', Buffer.from('glb'));
  const file = path.join(s.downloads, 'oak-chair-v2.zip'); z.writeZip(file);
  const r = await s.call('POST', '/download', { store: 'fab', path: file, referrer: 'https://www.fab.com/library' }, ok);
  assert.strictEqual(r.body.id, 'fab:u1');
  assert.strictEqual(s.library.list().length, 2);
  s.close();
});

test('unity asset store packages are accepted and DAZ/Unity stores are known', async () => {
  const s = await setup();
  await s.call('POST', '/items', { store: 'unity', items: [{ id: '123', title: 'Stylized Props', thumbnail: 'https://cdn.x/p.jpg' }] }, ok);
  assert.strictEqual(s.library.get('unity:123').provider, 'unity');
  const file = path.join(s.downloads, 'Stylized Props.unitypackage'); fs.writeFileSync(file, 'pkg');
  const r = await s.call('POST', '/download', { store: 'unity', path: file, referrer: 'https://assetstore.unity.com/packages/x' }, ok);
  assert.strictEqual(r.body.id, 'unity:123');
  assert.deepStrictEqual(s.library.get('unity:123').files.map(f => f.format), ['unitypackage']);
  assert.strictEqual((await s.call('POST', '/items', { store: 'daz', items: [{ id: 'd1', title: 'Genesis Outfit', thumbnail: 'https://cdn.x/g.jpg' }] }, ok)).body.added, 1);
  const u = fs.mkdtempSync(path.join(os.tmpdir(), 'tiko-'));
  const { engines } = require('../src/engines');
  const msg = await engines.unity.importAsset({ asset: s.library.get('unity:123'), project: { path: u }, config: {} });
  assert.match(msg, /double-click/);
  assert.ok(fs.existsSync(path.join(u, 'Assets/TikoAssets/Stylized_Props/Stylized Props.unitypackage')));
  s.close();
});
