const fs = require('fs');
const path = require('path');

// Preferred import format per engine, best first.
const PREFERRED = {
  unity:   ['unitypackage', 'fbx', 'obj', 'dae', 'gltf', 'glb'],     // glb/gltf need the glTFast package
  godot:   ['glb', 'gltf', 'fbx', 'obj', 'dae'],
  unreal:  ['fbx', 'glb', 'gltf', 'obj', 'usd'],
  blender: ['blend', 'glb', 'gltf', 'fbx', 'obj', 'usd', 'usdz', 'abc', 'dae']
};

function pickPrimary(asset, engine) {
  for (const fmt of PREFERRED[engine]) {
    const f = asset.files.find(x => x.format === fmt);
    if (f) return f;
  }
  return null;
}

// Copy the whole asset folder so textures/.bin files stay next to the model.
function copyAssetDir(asset, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(asset.dir, destDir, {
    recursive: true,
    filter: s => path.basename(s) !== 'download.zip'
  });
}

const safeName = asset => asset.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Asset';

module.exports = { PREFERRED, pickPrimary, copyAssetDir, safeName };
