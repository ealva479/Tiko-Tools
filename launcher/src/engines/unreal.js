const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pickPrimary, copyAssetDir, safeName } = require('./common');

// Unreal needs a real import step, done through the editor's Python commandlet.
const script = (file, dest) => `import unreal
task = unreal.AssetImportTask()
task.filename = r"${file}"
task.destination_path = "${dest}"
task.automated = True
task.save = True
task.replace_existing = True
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
`;

module.exports = {
  id: 'unreal', name: 'Unreal Engine',
  detect: dir => fs.readdirSync(dir).some(f => f.endsWith('.uproject')),
  async importAsset({ asset, project, config }) {
    const primary = pickPrimary(asset, 'unreal');
    if (!primary) throw new Error('No model format Unreal can import.');
    const name = safeName(asset);
    const staging = path.join(project.path, 'Saved', 'TikoImport', name);
    copyAssetDir(asset, staging);
    const file = path.join(staging, path.relative(asset.dir, primary.path));
    const py = path.join(staging, '_import.py');
    fs.writeFileSync(py, script(file.replace(/\\/g, '/'), `/Game/TikoAssets/${name}`));
    const uproject = fs.readdirSync(project.path).find(f => f.endsWith('.uproject'));
    if (!config.unrealEditor) {
      return `Staged in Saved/TikoImport/${name}. Set the UnrealEditor-Cmd path in Settings to import automatically, or run _import.py from the editor's Python console.`;
    }
    await new Promise((res, rej) => {
      const p = spawn(config.unrealEditor, [path.join(project.path, uproject), `-run=pythonscript`, `-script=${py}`, '-unattended', '-nosplash'], { stdio: 'ignore' });
      p.on('exit', c => c === 0 ? res() : rej(new Error(`UnrealEditor-Cmd exited ${c} (close the editor first if it is open)`)));
      p.on('error', rej);
    });
    return `Imported to /Game/TikoAssets/${name}`;
  }
};
