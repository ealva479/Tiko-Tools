const fs = require('fs');
const path = require('path');

// Tiny JSON-file store; avoids native deps so the app installs anywhere.
class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.data = defaults;
    try { this.data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

function openStores(home) {
  return {
    home,
    assetsDir: path.join(home, 'assets'),
    library: new JsonStore(path.join(home, 'library.json'), { assets: [] }),
    config: new JsonStore(path.join(home, 'config.json'), {
      tokens: {}, projects: [], blenderPath: '', unrealEditor: '',
      extToken: '', extPort: 47821, extLastSeen: 0, embedStores: false, extraDownloadDir: '',
      storeMode: 'chrome', chromePath: '', unityEditor: ''
    })
  };
}

module.exports = { JsonStore, openStores };
