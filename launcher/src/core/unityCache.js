// Unity's Package Manager keeps downloaded Asset Store packages here as
// <publisher>/<category>/<name>.unitypackage. Importing them into the library
// lets them be sent to any Unity project from the launcher.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { slug } = require('./library');

function cacheDirs() {
  const h = os.homedir();
  return {
    win32: [path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), 'Unity', 'Asset Store-5.x')],
    darwin: [path.join(h, 'Library', 'Unity', 'Asset Store-5.x')],
    linux: [path.join(h, '.local', 'share', 'unity3d', 'Asset Store-5.x')]
  }[process.platform] || [];
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.toLowerCase().endsWith('.unitypackage') ? [p] : [];
  });
}

// Returns how many new packages were added.
function scanUnityCache(library, dirs = cacheDirs()) {
  let added = 0;
  for (const root of dirs.filter(d => fs.existsSync(d))) {
    for (const file of walk(root)) {
      const rel = path.relative(root, file);
      const providerId = slug(rel.replace(/\.unitypackage$/i, ''));
      const prev = library.get(`unity:${providerId}`);
      if (prev && prev.downloaded) continue;
      const dir = library.dirFor('unity', providerId);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(file, path.join(dir, path.basename(file)));
      const title = path.basename(file, path.extname(file));
      const a = library.upsert({ provider: 'unity', providerId, title: prev ? prev.title : title, source: 'unity-cache', author: path.dirname(rel).split(path.sep)[0] || undefined, dir, downloaded: true });
      library.refreshFiles(a.id);
      added++;
    }
  }
  return added;
}

module.exports = { scanUnityCache, cacheDirs };
