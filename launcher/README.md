# Tiko Launcher

One library for every 3D asset you own, with one-click "send to project" for Unity, Godot, Unreal and Blender.

    npm install
    npm start        # Electron app
    npm test         # core + engine tests (no Electron needed)

## How assets get in
- **Sketchfab**: API token (Settings), then "Sync" lists purchases and your uploads; "Download" fetches the glTF archive.
- **Fab, CGTrader, TurboSquid, RenderHub** (no public library API): click the store in the sidebar. The launcher starts your installed Chrome (or Edge) with its own profile and watches it.
  1. First time only: sign in to your Google account in that Chrome window. Chrome sync brings your saved passwords and autofill, and the login is kept between runs.
  2. Open your library page in that Chrome. Your purchases appear in the launcher as cards.
  3. Downloads you make there from those stores are imported automatically (into the matching card when it can tell which one) and the launcher comes to the front. Other downloads made in that Chrome are moved to your normal Downloads folder.
  Chrome is only reachable from this computer (DevTools port on 127.0.0.1). Only listing data (id, title, thumbnail, author) is read from pages, and only on store library pages.
  Alternatives in Settings, "Open stores with": your normal browser plus the optional extension in `extension/` (see below), or a panel inside the launcher.
  Set the Chrome path in Settings if it isn't found automatically.
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

## Optional: browser extension (your everyday browser)
Chrome/Edge: `chrome://extensions`, Developer mode, Load unpacked, choose `launcher/extension`. Copy the pairing token from Settings into the extension popup, then set "Open stores with" to "My normal browser + extension".

## Extending
- New API store: add `src/providers/<id>.js` exporting `{id, name, sync, download}` and register it in `providers/index.js`.
- New engine: add `src/engines/<id>.js` exporting `{id, name, detect, importAsset}` and register it in `engines/index.js`.
