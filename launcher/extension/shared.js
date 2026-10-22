// Shared by the launcher (Node) and the browser extension (page, content script
// and service worker), so there is one definition of "what a store looks like"
// and "what an asset listing looks like".
(function (root) {

// libraryPath: only read listing data while the page URL matches this.
const STORES = {
  fab:        { name: 'Fab',        url: 'https://www.fab.com/library', hosts: ['fab.com'], libraryPath: /library/i, listing: id => `https://www.fab.com/listings/${id}` },
  cgtrader:   { name: 'CGTrader',   url: 'https://www.cgtrader.com/', hosts: ['cgtrader.com'], libraryPath: /order|purchase|download|library|account|dashboard/i },
  turbosquid: { name: 'TurboSquid', url: 'https://www.turbosquid.com/', hosts: ['turbosquid.com'], libraryPath: /order|purchase|download|library|account|my/i },
  renderhub:  { name: 'RenderHub',  url: 'https://www.renderhub.com/', hosts: ['renderhub.com'], libraryPath: /order|purchase|download|library|account|my/i },
  unity:      { name: 'Unity Asset Store', url: 'https://assetstore.unity.com/account/assets', hosts: ['assetstore.unity.com'], libraryPath: /account|assets|library/i, listing: null },
  daz:        { name: 'DAZ 3D',     url: 'https://www.daz3d.com/', hosts: ['daz3d.com'], libraryPath: /account|library|order|product/i },
  other:      { name: 'Other',      url: 'https://www.google.com/', hosts: [], libraryPath: /./ }
};

function storeForHost(host) {
  host = String(host || '').toLowerCase();
  return Object.keys(STORES).find(id => STORES[id].hosts.some(h => host === h || host.endsWith('.' + h))) || null;
}

// Accepts only http(s) URLs that belong to the given store.
function safeStoreUrl(id, url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && storeForHost(u.hostname) === id ? u.href : null;
  } catch { return null; }
}

const IMG = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;
const IMG_KEY = /thumb|image|preview|cover|media|picture/i;
const BAD_KEY = /avatar|profile|logo|icon|flag|badge/i;

function findImage(o, depth = 0) {
  if (depth > 3 || !o || typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v) && !BAD_KEY.test(k) && (IMG.test(v) || IMG_KEY.test(k))) return v;
  }
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !BAD_KEY.test(k)) { const r = findImage(v, depth + 1); if (r) return r; }
  }
  return null;
}

function toItem(o) {
  const title = typeof o.title === 'string' ? o.title : typeof o.name === 'string' ? o.name : null;
  const rawId = o.uid ?? o.listingUid ?? o.listingId ?? o.id ?? o.slug;
  if (!title || title.length > 200 || rawId == null || typeof rawId === 'object') return null;
  const image = findImage(o);
  if (!image) return null;
  const who = o.user || o.seller || o.author || o.creator || o.artist || {};
  return {
    id: String(rawId), title: title.trim(), thumbnail: image,
    author: who.sellerName || who.displayName || who.name || (typeof o.author === 'string' ? o.author : undefined)
  };
}

function extractItems(json) {
  const found = new Map();
  (function visit(v, depth) {
    if (!v || typeof v !== 'object' || depth > 10) return;
    if (!Array.isArray(v)) {
      const item = toItem(v);
      if (item) { if (!found.has(item.id)) found.set(item.id, item); return; }
    }
    for (const c of Object.values(v)) visit(c, depth + 1);
  })(json, 0);
  return [...found.values()];
}

const api = { extractItems, STORES, storeForHost, safeStoreUrl };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.TikoShared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
