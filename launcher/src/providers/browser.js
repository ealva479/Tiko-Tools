// Providers for stores without a public library API (Fab, CGTrader,
// TurboSquid, RenderHub, ...). Each store is shown inside the launcher window
// with its own persistent login. While you browse your library there:
//  - listing data the page loads is read and added to the library as cards
//  - files you download are captured, unzipped and indexed (and merged into the
//    card you started from, if you came from "Get from <store>")
const path = require('path');
const fs = require('fs');
const { extractItems } = require('./harvest');
const { ingestItems } = require('../core/ingest');
const { extractZip, slug } = require('../core/library');

const { STORES } = require('../../extension/shared');

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

// Creates the embedded view for one store. hooks: { onChanged(count), onSnapshot(file), snapshotsDir }
function createStoreView({ WebContentsView, session }, id, library, hooks) {
  const store = STORES[id];
  if (!store) throw new Error(`Unknown store: ${id}`);
  const ses = session.fromPartition(`persist:store-${id}`);
  const view = new WebContentsView({ webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const wc = view.webContents;
  const state = { pendingAsset: null, log: [] };

  ses.on('will-download', (_e, item, source) => {
    if (source !== wc) return;
    const filename = path.basename(item.getFilename());
    const base = path.basename(filename, path.extname(filename));
    const prev = state.pendingAsset && library.get(state.pendingAsset);
    state.pendingAsset = null;
    const providerId = prev ? prev.providerId : `${slug(base)}-${Date.now().toString(36)}`;
    const dir = library.dirFor(id, providerId);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, filename);
    item.setSavePath(dest);
    item.once('done', (_ev, st) => {
      if (st !== 'completed') return;
      try {
        if (filename.toLowerCase().endsWith('.zip')) extractZip(dest, dir);
        const a = library.upsert({ provider: id, providerId, title: prev ? prev.title : base, pageUrl: prev ? prev.pageUrl : wc.getURL(), dir, downloaded: true });
        library.refreshFiles(a.id);
        hooks.onChanged(1, `Added "${a.title}" from ${store.name}`);
      } catch (err) { console.error('capture failed', err); }
    });
  });

  // Read listing JSON the page itself loads (only while on a library-like page).
  const dbg = wc.debugger;
  try {
    dbg.attach('1.3');
    dbg.sendCommand('Network.enable');
    const pending = new Map();
    dbg.on('message', (_e, method, p) => {
      if (method === 'Network.responseReceived' && /json/i.test(p.response.mimeType) && ['XHR', 'Fetch'].includes(p.type)) pending.set(p.requestId, p.response.url);
      else if (method === 'Network.loadingFinished' && pending.has(p.requestId)) {
        const url = pending.get(p.requestId); pending.delete(p.requestId);
        if (p.encodedDataLength > 8e6 || !store.libraryPath.test(wc.getURL())) return;
        dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId }).then(r => {
          const items = extractItems(JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString() : r.body));
          // No page content is logged, only counts, so the log is safe to share.
          state.log.push(`${new Date().toISOString()} ${new URL(url).origin}${new URL(url).pathname} items=${items.length}`);
          if (!items.length) return;
          ingestItems(library, id, items, wc.getURL());
          hooks.onChanged(items.length, `${store.name}: found ${items.length} items in your library`);
        }).catch(() => {});
      }
    });
  } catch (err) { console.error('debugger attach failed', err); }

  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.shift || !(input.control || input.meta) || input.key.toLowerCase() !== 's') return;
    e.preventDefault();
    savePageSnapshot(wc, hooks.snapshotsDir, id).then(f => {
      fs.writeFileSync(f.replace(/\.html$/, '.log.txt'), state.log.join('\n') || 'no JSON responses read yet');
      hooks.onSnapshot(f);
    }).catch(err => console.error('snapshot failed', err));
  });

  return { view, state, load: url => wc.loadURL(url || store.url), url: () => wc.getURL() };
}

module.exports = { STORES, createStoreView, savePageSnapshot };
