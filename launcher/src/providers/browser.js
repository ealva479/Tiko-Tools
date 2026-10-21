// Providers for stores without a public library API (Fab, CGTrader,
// TurboSquid, RenderHub, ...). The user signs in inside an app window that
// has its own persistent session. Any file they download from their own
// purchases there is captured and indexed automatically.
const path = require('path');
const fs = require('fs');
const { extractZip, slug } = require('../core/library');

const STORES = {
  fab:        { name: 'Fab',        url: 'https://www.fab.com/library' },
  cgtrader:   { name: 'CGTrader',   url: 'https://www.cgtrader.com/' },
  turbosquid: { name: 'TurboSquid', url: 'https://www.turbosquid.com/' },
  renderhub:  { name: 'RenderHub',  url: 'https://www.renderhub.com/' },
  other:      { name: 'Other',      url: 'https://www.google.com/' }
};

// Cleaned copy of the current page for building site-specific scrapers: scripts,
// styles, forms, inline data and text inside inputs are removed, and long
// attribute values (tokens, signed URLs) are truncated before it touches disk.
const SNAPSHOT_JS = `(() => {
  const d = document.documentElement.cloneNode(true);
  d.querySelectorAll('script,style,noscript,iframe,svg,input,textarea,select,link[rel=stylesheet],meta').forEach(n => n.remove());
  d.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) {
    if (/^(on|data-(?!testid|test|id))/.test(a.name) || a.name === 'style') n.removeAttribute(a.name);
    else if (a.value.length > 160) n.setAttribute(a.name, a.value.slice(0, 160) + '...[truncated]');
  } });
  return '<!-- ' + (location.protocol.startsWith('http') ? location.origin + location.pathname : location.protocol) + ' -->\\n' + d.outerHTML;
})()`;

async function savePageSnapshot(wc, dir, id) {
  const html = await wc.executeJavaScript(SNAPSHOT_JS);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}-${Date.now()}.html`);
  fs.writeFileSync(file, html);
  return file;
}

function openStoreWindow({ BrowserWindow, session }, id, library, onAdded, url, snapshotsDir, onSnapshot = () => {}) {
  const store = STORES[id];
  if (!store) throw new Error(`Unknown store: ${id}`);
  const ses = session.fromPartition(`persist:store-${id}`);
  const win = new BrowserWindow({
    width: 1200, height: 850, title: `${store.name} - downloads are added to your library`,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  ses.on('will-download', (_e, item, wc) => {
    const filename = path.basename(item.getFilename());
    const providerId = `${slug(path.basename(filename, path.extname(filename)))}-${Date.now().toString(36)}`;
    const dir = library.dirFor(id, providerId);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, filename);
    item.setSavePath(dest);
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return;
      try {
        if (filename.toLowerCase().endsWith('.zip')) extractZip(dest, dir);
        const a = library.upsert({
          provider: id, providerId, title: path.basename(filename, path.extname(filename)),
          pageUrl: wc.getURL(), dir, downloaded: true
        });
        library.refreshFiles(a.id);
        onAdded(library.get(a.id));
      } catch (err) { console.error('capture failed', err); }
    });
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 's' && snapshotsDir) {
      e.preventDefault();
      savePageSnapshot(win.webContents, snapshotsDir, id).then(onSnapshot).catch(err => console.error('snapshot failed', err));
    }
  });
  win.loadURL(url || store.url);
  return win;
}

module.exports = { STORES, openStoreWindow, savePageSnapshot };
