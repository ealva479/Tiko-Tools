const fs = require('fs');
const path = require('path');
const { pickPrimary, copyAssetDir, safeName } = require('./common');

module.exports = {
  id: 'godot', name: 'Godot',
  detect: dir => fs.existsSync(path.join(dir, 'project.godot')),
  async importAsset({ asset, project, format }) {
    if (!pickPrimary(asset, 'godot', format)) throw new Error('No model format Godot can import.');
    const dest = path.join(project.path, 'assets', safeName(asset));
    copyAssetDir(asset, dest); // Godot auto-imports glb/gltf/fbx/obj on focus
    return `Copied to res://assets/${path.basename(dest)}`;
  }
};
