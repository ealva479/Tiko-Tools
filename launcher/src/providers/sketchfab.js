const path = require('path');
const { getJson, download } = require('../core/download');
const { extractZip } = require('../core/library');

const API = 'https://api.sketchfab.com/v3';
const auth = token => ({ Authorization: `Token ${token}` });

async function collect(url, token, limit = 500) {
  const out = [];
  while (url && out.length < limit) {
    const page = await getJson(url, auth(token));
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

function toMeta(m, source) {
  const thumbs = (m.thumbnails && m.thumbnails.images) || [];
  const best = thumbs.slice().sort((a, b) => b.width - a.width)[0];
  return {
    provider: 'sketchfab',
    providerId: m.uid,
    title: m.name,
    author: m.user && m.user.displayName,
    thumbnail: best && best.url,
    pageUrl: m.viewerUrl,
    license: m.license && m.license.label,
    tags: (m.tags || []).map(t => t.name || t),
    source
  };
}

module.exports = {
  id: 'sketchfab',
  name: 'Sketchfab',
  auth: 'token', // Settings > Password & API on sketchfab.com
  // Lists purchased models plus the user's own uploads.
  async sync({ token, library }) {
    if (!token) throw new Error('Add your Sketchfab API token in Settings first.');
    const [purchases, own] = await Promise.all([
      collect(`${API}/me/models/purchases`, token).catch(() => []),
      collect(`${API}/me/models`, token).catch(() => [])
    ]);
    const seen = new Set();
    let n = 0;
    for (const [list, source] of [[purchases, 'purchased'], [own, 'uploaded']]) {
      for (const m of list) {
        const model = m.model || m; // purchases wrap the model object
        if (seen.has(model.uid)) continue;
        seen.add(model.uid);
        library.upsert(toMeta(model, source));
        n++;
      }
    }
    return n;
  },
  // Fetches the glTF archive and extracts it into the library.
  async download({ asset, token, library }) {
    const info = await getJson(`${API}/models/${asset.providerId}/download`, auth(token));
    const fmt = info.gltf || info.glb || info.source;
    if (!fmt) throw new Error('No downloadable format returned (is this model downloadable on your plan?)');
    const dir = library.dirFor('sketchfab', asset.providerId);
    const zip = path.join(dir, 'download.zip');
    await download(fmt.url, zip); // signed URL: no auth header
    extractZip(zip, dir);
    return library.upsert({ provider: 'sketchfab', providerId: asset.providerId, dir, downloaded: true });
  }
};
