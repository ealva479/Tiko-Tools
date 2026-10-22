const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pickPrimary, copyAssetDir, safeName } = require('./common');

module.exports = {
  id: 'unity', name: 'Unity',
  detect: dir => fs.existsSync(path.join(dir, 'ProjectSettings', 'ProjectVersion.txt')),
  async importAsset({ asset, project, config, format }) {
    const primary = pickPrimary(asset, 'unity', format);
    if (!primary) throw new Error('No model format Unity can import.');
    if (primary.format === 'unitypackage') {
      // With the editor path set, import headless (project must be closed); otherwise stage it for a double-click.
      if (config.unityEditor) {
        await new Promise((res, rej) => {
          const p = spawn(config.unityEditor, ['-batchmode', '-quit', '-projectPath', project.path, '-importPackage', primary.path], { stdio: 'ignore' });
          p.on('exit', c => c === 0 ? res() : rej(new Error(`Unity exited ${c} (close the project in Unity first)`)));
          p.on('error', rej);
        });
        return `Imported package "${safeName(asset)}" into the project`;
      }
      const dest = path.join(project.path, 'Assets', 'TikoAssets', safeName(asset));
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(primary.path, path.join(dest, path.basename(primary.path)));
      return `Copied to Assets/TikoAssets/${path.basename(dest)}. In Unity, double-click the .unitypackage to import it (or set the Unity editor path in Settings to import automatically).`;
    }
    const dest = path.join(project.path, 'Assets', 'TikoAssets', safeName(asset));
    copyAssetDir(asset, dest); // Unity imports on next editor focus
    const note = ['glb', 'gltf'].includes(primary.format) ? ' (glb/gltf needs the glTFast package)' : '';
    return `Copied to Assets/TikoAssets/${path.basename(dest)}${note}`;
  }
};
