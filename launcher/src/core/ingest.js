const fs = require('fs');
const path = require('path');
const { STORES, safeStoreUrl } = require('../../extension/shared');
const { extractZip, slug, MODEL_EXTS } = require('./library');

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const httpUrl = v => { try { return /^https?:$/.test(new URL(v).protocol) ? v : undefined; } catch { return undefined; } };
const pageKey = u => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ''); } catch { return ''; } };

// Store listings reported by the browser extension or an embedded store view.
// Input is untrusted: everything is type-checked and clipped here.
function ingestItems(library, storeId, items, pageUrl) {
  const store = STORES[storeId];
  if (!store || !Array.isArray(items)) return 0;
  let n = 0;
  for (const it of items.slice(0, 2000)) {
    if (!it || it.id == null || typeof it.title !== 'string') continue;
    const providerId = String(it.id).slice(0, 200);
    const prev = library.get(`${storeId}:${providerId}`);
    library.upsert({
      provider: storeId, providerId, title: it.title.slice(0, 200).trim(), author: clip(it.author, 120), source: 'library',
      ...(prev && prev.generatedThumb || !httpUrl(it.thumbnail) ? {} : { thumbnail: it.thumbnail }),
      pageUrl: (prev && prev.pageUrl) || (store.listing && store.listing(providerId)) || safeStoreUrl(storeId, pageUrl) || store.url
    });
    n++;
  }
  return n;
}

// A file the user downloaded in their own browser. Merged into the matching
// library card when its page URL equals the download's referrer, else a new asset.
function ingestFile(library, storeId, filePath, referrer) {
  const real = fs.realpathSync(filePath);
  const ext = path.extname(real).toLowerCase();
  if (!fs.statSync(real).isFile() || (ext !== '.zip' && !MODEL_EXTS.includes(ext))) throw new Error('Unsupported file type');
  const key = pageKey(referrer);
  const base = path.basename(real, ext);
  const waiting = library.list().filter(a => a.provider === storeId && !a.downloaded);
  // Prefer the card whose page the download came from; else a card whose title matches the file name.
  const fileSlug = slug(base);
  const similar = a => { const t = slug(a.title); return t.length >= 4 && (fileSlug.includes(t) || t.includes(fileSlug)); };
  const prev = (key && waiting.find(a => pageKey(a.pageUrl) === key)) || (() => { const m = waiting.filter(similar); return m.length === 1 ? m[0] : null; })();
  const providerId = prev ? prev.providerId : `${slug(base)}-${Date.now().toString(36)}`;
  const dir = library.dirFor(storeId, providerId);
  fs.mkdirSync(dir, { recursive: true });
  if (ext === '.zip') extractZip(real, dir); else fs.copyFileSync(real, path.join(dir, path.basename(real)));
  const a = library.upsert({ provider: storeId, providerId, title: prev ? prev.title : base, pageUrl: prev ? prev.pageUrl : safeStoreUrl(storeId, referrer) || STORES[storeId].url, dir, downloaded: true });
  return library.refreshFiles(a.id);
}

module.exports = { ingestItems, ingestFile };
