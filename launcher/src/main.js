const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { createBridge } = require('./core/bridge');
const { createChromeBridge } = require('./core/chromeBridge');
const { scanUnityCache } = require('./core/unityCache');
const { STORES, safeStoreUrl } = require('../extension/shared');
const { openStores } = require('./core/store');
const { Library, dirSize, assetUrl } = require('./core/library');
const { findChrome } = require('./core/chromeBridge');
const providers = require('./providers');
const { engines, detectEngine } = require('./engines');

// asset://local/<abs path> serves files from the library folder only, so the
// renderer (and three.js loaders) never get general filesystem access.
protocol.registerSchemesAsPrivileged([{ scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const TEST_MODE = !!process.env.TIKO_LAUNCHER_HOME;
if (!TEST_MODE && !app.requestSingleInstanceLock()) app.quit();
// tiko-launcher:// lets the browser extension bring the launcher to the front.
if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient('tiko-launcher', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('tiko-launcher');

let stores, library, win, chrome;

function focusWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); app.focus({ steal: true });
}
app.on('second-instance', focusWindow);
app.on('open-url', e => { e.preventDefault(); focusWindow(); });

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
  // Stores are embedded views over the main content area (right of the sidebar).
  const SIDEBAR = 240;
  const storeViews = {};
  let activeStore = null;
  const layout = () => {
    if (!activeStore) return;
    const { width, height } = win.getContentBounds();
    storeViews[activeStore].view.setBounds({ x: SIDEBAR, y: 0, width: Math.max(0, width - SIDEBAR), height });
  };
  const hideStore = () => {
    if (activeStore) win.contentView.removeChildView(storeViews[activeStore].view);
    activeStore = null;
  };
  win.on('resize', layout);
  ipcMain.handle('store:show', (_e, id, url, assetId) => {
    hideStore();
    if (!storeViews[id]) {
      storeViews[id] = providers.browser.createStoreView({ WebContentsView, session }, id, library, {
        snapshotsDir: path.join(stores.home, 'snapshots'),
        onChanged: (n, msg) => send('library:changed', msg),
        onSnapshot: f => { send('snapshot:saved', f); shell.showItemInFolder(f); }
      });
      storeViews[id].load();
    }
    const sv = storeViews[id];
    if (url && url !== sv.url()) sv.load(url);
    sv.state.pendingAsset = assetId || null;
    win.contentView.addChildView(sv.view);
    activeStore = id;
    layout();
  });
  ipcMain.handle('store:hide', hideStore);
  ipcMain.handle('ext:status', () => ({ token: cfg().extToken, port: cfg().extPort, lastSeen: cfg().extLastSeen }));
  // How a store opens: the launcher's own Chrome (default), the user's browser + extension, or an embedded panel.
  ipcMain.handle('store:open', async (_e, id, url, assetId) => {
    const target = (url && safeStoreUrl(id, url)) || STORES[id].url;
    const mode = cfg().storeMode;
    if (mode === 'chrome') {
      if (!cfg().chromeSignInDone) { // first run: sign in with a plain window (see chromeBridge.signIn)
        cfg().chromeSignInDone = true; stores.config.save();
        await chrome.signIn(target);
        return { mode, firstRun: true };
      }
      await chrome.open(target, assetId);
      return { mode };
    }
    if (mode === 'extension') { await shell.openExternal(target); return { mode }; }
    return { mode: 'embedded' };
  });
  ipcMain.handle('store:signin', async (_e, id) => {
    await chrome.signIn((STORES[id] || STORES.fab).url);
    cfg().chromeSignInDone = true; stores.config.save();
  });
  ipcMain.handle('pick:dir', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('library:move', async (_e, dir) => library.moveTo(dir, (i, n) => send('library:changed', `Moving library: ${i}/${n}`)));
  ipcMain.handle('diag:get', () => ({
    chrome: findChrome(cfg().chromePath), signInDone: cfg().chromeSignInDone, mode: cfg().storeMode,
    syncLog: cfg().syncLog, extLastSeen: cfg().extLastSeen, libraryDir: stores.assetsDir,
    libraryBytes: dirSize(stores.assetsDir), assets: library.list().length
  }));
  ipcMain.handle('diag:resetSignIn', () => { cfg().chromeSignInDone = false; stores.config.save(); });
  ipcMain.handle('unity:scanCache', () => scanUnityCache(library));
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
  ipcMain.handle('asset:send', async (_e, id, projectPath, format) => {
    const asset = library.get(id);
    const project = cfg().projects.find(p => p.path === projectPath);
    if (!asset || !project) throw new Error('Unknown asset or project');
    if (!asset.downloaded) throw new Error('Download the asset first.');
    if (!asset.files.length) throw new Error(asset.provider === 'daz'
      ? 'DAZ content is in Daz formats. Export it from Daz Studio (FBX or glTF, e.g. with the Daz to Blender/Unreal/Unity bridge), then drag the export into the launcher.'
      : 'No importable model files were found in this download.');
    if (asset.files.every(f => f.format === 'unitypackage') && project.engine !== 'unity') throw new Error('Unity packages can only be imported into Unity projects.');
    if (format && !asset.files.some(f => f.format === format)) throw new Error(`This asset has no ${format} file.`);
    const message = await engines[project.engine].importAsset({ asset, project, config: cfg(), format });
    cfg().history = [{ assetId: id, project: project.name, engine: project.engine, format: format || null, at: Date.now(), message }, ...cfg().history].slice(0, 500);
    stores.config.save();
    return message;
  });
  ipcMain.handle('asset:info', (_e, id) => {
    const a = library.get(id);
    if (!a) return null;
    const files = (a.files || []).map(f => { let size = 0; try { size = fs.statSync(f.path).size; } catch {} return { format: f.format, name: path.relative(a.dir, f.path), size }; });
    return { files, total: a.dir ? dirSize(a.dir) : 0, history: cfg().history.filter(h => h.assetId === id).slice(0, 8) };
  });
  ipcMain.handle('asset:openPage', (_e, id) => {
    const a = library.get(id);
    let u; try { u = new URL(a && a.pageUrl); } catch { return false; }
    const ok = /^https:$/.test(u.protocol) && (safeStoreUrl(a.provider, u.href) || /(^|\.)sketchfab\.com$/.test(u.hostname));
    if (ok) shell.openExternal(u.href);
    return !!ok;
  });
  ipcMain.handle('asset:reveal', (_e, id) => shell.showItemInFolder(library.get(id).dir));
  ipcMain.handle('asset:setThumb', (_e, id, dataUrl) => {
    const a = library.get(id);
    if (!a || !a.dir || !/^data:image\/png;base64,/.test(dataUrl)) return;
    const file = path.join(a.dir, '_thumb.png');
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    library.upsert({ provider: a.provider, providerId: a.providerId, thumbnail: assetUrl(file), generatedThumb: true });
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
    if (!library.isServable(p)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(path.resolve(p)).href);
  });
  createWindow();
  handlers();
  const cfg = stores.config.data;
  const logSync = (store, n, via) => { const e = cfg.syncLog[store] || { total: 0 }; cfg.syncLog[store] = { at: Date.now(), last: n, total: e.total + n, via }; stores.config.save(); };
  if (!cfg.extToken) { cfg.extToken = crypto.randomBytes(24).toString('hex'); stores.config.save(); }
  const bridge = createBridge({
    library, getToken: () => cfg.extToken,
    downloadDirs: () => [app.getPath('downloads'), cfg.extraDownloadDir].filter(Boolean).map(d => { try { return fs.realpathSync(d); } catch { return d; } }),
    onSeen: () => { cfg.extLastSeen = Date.now(); },
    onItems: (store, n) => { logSync(store, n, 'extension'); send('library:changed', `${STORES[store].name}: synced ${n} items from your browser`); },
    onDownload: a => { send('library:changed', `Added "${a.title}" from your browser`); focusWindow(); }
  });
  chrome = createChromeBridge({
    library, profileDir: path.join(stores.home, 'chrome-profile'), stagingDir: path.join(stores.home, 'chrome-downloads'),
    getChromePath: () => cfg.chromePath, downloadsDir: () => app.getPath('downloads'),
    hooks: {
      onItems: (store, n) => { logSync(store, n, 'chrome'); send('library:changed', `${STORES[store].name}: synced ${n} items from Chrome`); },
      onDownload: a => { send('library:changed', `Added "${a.title}" from Chrome`); focusWindow(); },
      onState: msg => send('library:changed', msg)
    }
  });
  app.on('before-quit', () => chrome.close());
  bridge.on('error', err => console.error('extension bridge unavailable:', err.message));
  bridge.listen(cfg.extPort, '127.0.0.1');
});
app.on('window-all-closed', () => app.quit());
