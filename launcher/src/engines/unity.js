const fs = require('fs');
const path = require('path');
const { pickPrimary, copyAssetDir, safeName } = require('./common');

module.exports = {
  id: 'unity', name: 'Unity',
  detect: dir => fs.existsSync(path.join(dir, 'ProjectSettings', 'ProjectVersion.txt')),
  async importAsset({ asset, project }) {
    const primary = pickPrimary(asset, 'unity');
    if (!primary) throw new Error('No model format Unity can import.');
    const dest = path.join(project.path, 'Assets', 'TikoAssets', safeName(asset));
    copyAssetDir(asset, dest); // Unity imports on next editor focus
    const note = ['glb', 'gltf'].includes(primary.format) ? ' (glb/gltf needs the glTFast package)' : '';
    return `Copied to Assets/TikoAssets/${path.basename(dest)}${note}`;
  }
};
