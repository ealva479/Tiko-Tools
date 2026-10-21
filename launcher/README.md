# Tiko Launcher

One library for every 3D asset you own, with one-click "send to project" for Unity, Godot, Unreal and Blender.

    npm install
    npm start        # Electron app
    npm test         # core + engine tests (no Electron needed)

## How assets get in
- **Sketchfab**: API token (Settings), then "Sync" lists purchases and your uploads; "Download" fetches the glTF archive.
- **Fab, CGTrader, TurboSquid, RenderHub** (no public library API): sign in with your normal browser (autofill, passkeys and Google sign-in all work) and use the **Browser extension**:
  1. Chrome/Edge: `chrome://extensions`, turn on Developer mode, **Load unpacked**, choose the `launcher/extension` folder.
  2. In the launcher: Settings, copy the pairing token. Click the extension icon, paste it, Save.
  3. Click a store in the launcher sidebar. It opens in your browser. Open your library page there and your purchases appear in the launcher as cards. Downloads you make from those stores are imported automatically and the launcher comes to the front.
  The extension only talks to `127.0.0.1` on your machine, needs the pairing token, and sends listings only (id, title, thumbnail, author), never page contents, cookies or passwords. If your browser downloads somewhere other than your default Downloads folder, set it in Settings.
  Without the extension, or with "Open stores inside the launcher" ticked, the store opens in a panel inside the launcher instead (separate login, downloads captured the same way).
- **Anything else**: drag files, folders or zips onto the window.
- **Page snapshots**: in any store window, Ctrl+Shift+S saves a cleaned copy of the current page (scripts, forms, inline data and long tokens removed) to the launcher data folder under `snapshots/`. It is meant for building a store-specific purchase lister. Skim it before sharing, since it still contains visible page text.
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
