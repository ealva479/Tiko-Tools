const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const MODEL_EXTS = ['.blend', '.fbx', '.glb', '.gltf', '.obj', '.usd', '.usdz', '.usda', '.abc', '.dae', '.3ds', '.stl', '.ply'];

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset';

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function findModels(dir) {
  return walk(dir)
    .filter(f => MODEL_EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => ({ path: f, format: path.extname(f).slice(1).toLowerCase() }));
}

// Safe zip extraction (adm-zip's extractAllTo already rejects path traversal).
function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  new AdmZip(zipPath).extractAllTo(destDir, true);
}

class Library {
  constructor(stores) {
    this.stores = stores;
  }
  get assets() { return this.stores.library.data.assets; }
  list() { return this.assets; }
  get(id) { return this.assets.find(a => a.id === id); }
  dirFor(provider, providerId) {
    return path.join(this.stores.assetsDir, slug(provider), slug(providerId));
  }
  // Insert or merge metadata by (provider, providerId).
  upsert(meta) {
    const id = `${meta.provider}:${meta.providerId}`;
    const i = this.assets.findIndex(a => a.id === id);
    const prev = i >= 0 ? this.assets[i] : { addedAt: Date.now(), files: [], tags: [] };
    const next = { ...prev, ...meta, id };
    if (i >= 0) this.assets[i] = next; else this.assets.push(next);
    this.stores.library.save();
    return next;
  }
  // Re-scan the asset folder for model files after a download/extract.
  refreshFiles(id) {
    const a = this.get(id);
    if (!a || !a.dir || !fs.existsSync(a.dir)) return a;
    a.files = findModels(a.dir);
    this.stores.library.save();
    return a;
  }
  // Register a folder or archive the user already has on disk.
  addFromPath(src, provider = 'local') {
    const stat = fs.statSync(src);
    const base = path.basename(src, path.extname(src));
    const providerId = `${slug(base)}-${Date.now().toString(36)}`;
    const dir = this.dirFor(provider, providerId);
    fs.mkdirSync(dir, { recursive: true });
    if (stat.isDirectory()) fs.cpSync(src, dir, { recursive: true });
    else if (src.toLowerCase().endsWith('.zip')) extractZip(src, dir);
    else fs.copyFileSync(src, path.join(dir, path.basename(src)));
    const a = this.upsert({ provider, providerId, title: base, dir, downloaded: true });
    return this.refreshFiles(a.id);
  }
  remove(id) {
    const a = this.get(id);
    if (!a) return;
    this.stores.library.data.assets = this.assets.filter(x => x.id !== id);
    this.stores.library.save();
  }
}

module.exports = { Library, findModels, extractZip, slug, MODEL_EXTS };
