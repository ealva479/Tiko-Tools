const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pickPrimary, safeName } = require('./common');

// Runs inside Blender. argv after "--": <model file> <save path or empty>
const SCRIPT = `import bpy, sys, os
src, save = sys.argv[sys.argv.index("--") + 1:][:2]
ext = os.path.splitext(src)[1].lower()
if ext in (".glb", ".gltf"): bpy.ops.import_scene.gltf(filepath=src)
elif ext == ".fbx": bpy.ops.import_scene.fbx(filepath=src)
elif ext == ".obj": bpy.ops.wm.obj_import(filepath=src)
elif ext in (".usd", ".usda", ".usdz"): bpy.ops.wm.usd_import(filepath=src)
elif ext == ".abc": bpy.ops.wm.alembic_import(filepath=src)
elif ext == ".dae": bpy.ops.wm.collada_import(filepath=src)
elif ext == ".blend":
    with bpy.data.libraries.load(src) as (a, b): b.collections = a.collections; b.objects = a.objects
    for c in b.collections: bpy.context.scene.collection.children.link(c)
if save: bpy.ops.wm.save_mainfile()
`;

module.exports = {
  id: 'blender', name: 'Blender',
  detect: dir => fs.statSync(dir).isFile() && dir.endsWith('.blend'),
  // project.path is a .blend file. Imports headless and saves it.
  async importAsset({ asset, project, config, format }) {
    const primary = pickPrimary(asset, 'blender', format);
    if (!primary) throw new Error('No model format Blender can import.');
    if (!config.blenderPath) throw new Error('Set the Blender executable path in Settings.');
    const py = path.join(asset.dir, '_tiko_import.py');
    fs.writeFileSync(py, SCRIPT);
    await new Promise((res, rej) => {
      const p = spawn(config.blenderPath, ['-b', project.path, '--python', py, '--', primary.path, project.path], { stdio: 'ignore' });
      p.on('exit', c => c === 0 ? res() : rej(new Error(`Blender exited ${c}`)));
      p.on('error', rej);
    });
    return `Imported "${safeName(asset)}" into ${path.basename(project.path)} (saved)`;
  }
};
