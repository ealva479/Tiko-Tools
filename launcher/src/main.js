const { app, BrowserWindow, ipcMain, dialog, session, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { openStores } = require('./core/store');
const { Library } = require('./core/library');
const providers = require('./providers');
const { engines, detectEngine } = require('./engines');

// asset://local/<abs path> serves files from the library folder only, so the
// renderer (and three.js loaders) never get general filesystem access.
protocol.registerSchemesAsPrivileged([{ scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let stores, library, win;

const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload);

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, title: 'Tiko Launcher', backgroundColor: '#14161a',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function handlers() {
  const cfg = () => stores.config.data;
  ipcMain.handle('library:list', () => library.list());
  ipcMain.handle('library:setTags', (_e, id, tags) => library.setTags(id, tags));
  ipcMain.handle('library:remove', (_e, id) => { library.remove(id); });

  ipcMain.handle('config:get', () => ({ ...cfg(), tokens: Object.fromEntries(Object.keys(cfg().tokens).map(k => [k, !!cfg().tokens[k]])) }));
  ipcMain.handle('config:set', (_e, patch) => {
    if (patch.tokens) Object.assign(cfg().tokens, patch.tokens), delete patch.tokens;
    Object.assign(cfg(), patch);
    stores.config.save();
  });

  ipcMain.handle('provider:sync', async (_e, id) => {
    const p = providers.api[id];
    if (!p) throw new Error(`No API provider: ${id}`);
    return p.sync({ token: cfg().tokens[id], library });
  });
  ipcMain.handle('asset:download', async (_e, id) => {
    const a = library.get(id);
    const p = providers.api[a.provider];
    if (!p) throw new Error('This asset has no API download. Use the store window to download it.');
    const out = await p.download({ asset: a, token: cfg().tokens[a.provider], library });
    return library.refreshFiles(out.id);
  });
  ipcMain.handle('store:open', (_e, id, url) => {
    providers.browser.openStoreWindow({ BrowserWindow, session }, id, library, a => send('library:added', a), url, path.join(stores.home, 'snapshots'), f => { send('snapshot:saved', f); shell.showItemInFolder(f); });
  });
  ipcMain.handle('store:list', () => Object.entries(providers.browser.STORES).map(([id, s]) => ({ id, name: s.name })));

  ipcMain.handle('local:add', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'openDirectory', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths.map(p => library.addFromPath(p));
  });
  ipcMain.handle('local:addPaths', (_e, paths) => paths.map(p => library.addFromPath(p)));

  ipcMain.handle('project:add', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'openFile'], filters: [{ name: 'Project', extensions: ['*'] }] });
    if (r.canceled) return null;
    const p = r.filePaths[0];
    const eng = detectEngine(p);
    if (!eng) throw new Error('Not a Unity, Godot, Unreal or .blend project.');
    const proj = { engine: eng.id, path: p, name: path.basename(p) };
    cfg().projects = cfg().projects.filter(x => x.path !== p).concat(proj);
    stores.config.save();
    return proj;
  });
  ipcMain.handle('project:remove', (_e, p) => { cfg().projects = cfg().projects.filter(x => x.path !== p); stores.config.save(); });
  ipcMain.handle('asset:send', async (_e, id, projectPath) => {
    const asset = library.get(id);
    const project = cfg().projects.find(p => p.path === projectPath);
    if (!asset || !project) throw new Error('Unknown asset or project');
    if (!asset.downloaded || !asset.files.length) throw new Error('Download the asset first.');
    return engines[project.engine].importAsset({ asset, project, config: cfg() });
  });
  ipcMain.handle('asset:reveal', (_e, id) => shell.showItemInFolder(library.get(id).dir));
  ipcMain.handle('asset:setThumb', (_e, id, dataUrl) => {
    const a = library.get(id);
    if (!a || !a.dir || !/^data:image\/png;base64,/.test(dataUrl)) return;
    const file = path.join(a.dir, '_thumb.png');
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    library.upsert({ provider: a.provider, providerId: a.providerId, thumbnail: 'asset://local/' + encodeURI(file.replace(/\\/g, '/')), generatedThumb: true });
    return library.get(id);
  });
  ipcMain.handle('pick:file', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
    return r.canceled ? '' : r.filePaths[0];
  });
}

app.whenReady().then(() => {
  stores = openStores(process.env.TIKO_LAUNCHER_HOME || path.join(app.getPath('userData'), 'launcher'));
  library = new Library(stores);
  protocol.handle('asset', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    const rel = path.relative(stores.assetsDir, path.resolve(p));
    if (rel.startsWith('..') || path.isAbsolute(rel)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(path.resolve(p)).href);
  });
  handlers();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
