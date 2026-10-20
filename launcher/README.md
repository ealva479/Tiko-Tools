# Tiko Launcher

One library for every 3D asset you own, with one-click "send to project" for Unity, Godot, Unreal and Blender.

    npm install
    npm start        # Electron app
    npm test         # core + engine tests (no Electron needed)

## How assets get in
- **Sketchfab**: API token (Settings), then "Sync" lists purchases and your uploads; "Download" fetches the glTF archive.
- **Fab, CGTrader, TurboSquid, RenderHub, other**: these have no public library API. "Open <store>" gives you a window with its own persistent login. Anything you download there from your own purchases is captured, unzipped and indexed automatically.
- **Anything else**: drag files, folders or zips onto the window.
- **Tags and filters**: type a tag on any card (comma-separate several) and press Enter. The search box matches titles, authors, sources and tags, and the dropdown filters by source.
- **3D preview**: the "3D" button on a card opens an orbit viewer (glb, gltf, fbx, obj). Assets with no thumbnail get one saved automatically from the first preview. Models load through a restricted `asset://` protocol that only serves the library folder.

## How assets go out
Add a project (Unity folder, Godot folder, Unreal folder with a .uproject, or a .blend file), then either drag a card onto it in the sidebar or select it and click "Send to project".
- Unity: copies to `Assets/TikoAssets/<name>` (glb/gltf needs glTFast)
- Godot: copies to `assets/<name>`
- Unreal: stages the files and runs an import script through `UnrealEditor-Cmd` (set its path in Settings; the editor must be closed)
- Blender: imports headless into the chosen .blend and saves it (set the Blender path in Settings)

## Extending
- New API store: add `src/providers/<id>.js` exporting `{id, name, sync, download}` and register it in `providers/index.js`.
- New engine: add `src/engines/<id>.js` exporting `{id, name, detect, importAsset}` and register it in `engines/index.js`.
