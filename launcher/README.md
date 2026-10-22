# Tiko Launcher

One library for every 3D asset you own, with one-click "send to project" for Unity, Godot, Unreal and Blender.

    npm install
    npm start        # Electron app
    npm test         # core + engine tests (no Electron needed)

## Opening it (Windows)
Double-click `Tiko Launcher.bat` (installs what's needed, then starts the app). After the first run, `Tiko Launcher (no console).vbs` starts it with no terminal window; right-click it, Send to, Desktop (create shortcut) for a desktop icon. After `git pull`, run the .bat once so new dependencies install.

## How assets get in
- **Sketchfab**: API token (Settings), then "Sync" lists purchases and your uploads; "Download" fetches the glTF archive.
- **Fab, CGTrader, TurboSquid, RenderHub** (no public library API): click the store in the sidebar. The launcher starts your installed Chrome (or Edge) with its own profile and watches it.
  1. First time only: the first click opens a plain Chrome window (no debugging connection, because Google and some stores refuse sign-in otherwise). Sign in to Google (Chrome sync brings your saved passwords and autofill) and then to each store, close the window, and click the store again. Logins are kept between runs. "Sign in to stores (Chrome)" in the sidebar reopens that window any time.
  2. Open your library page in the Chrome that opens next. Your purchases appear in the launcher as cards.
  3. Downloads you make there from those stores are imported automatically (into the matching card when it can tell which one) and the launcher comes to the front. Other downloads made in that Chrome are moved to your normal Downloads folder.
  Chrome is only reachable from this computer (DevTools port on 127.0.0.1). Only listing data (id, title, thumbnail, author) is read from pages, and only on store library pages.
  Alternatives in Settings, "Open stores with": your normal browser plus the optional extension in `extension/` (see below), or a panel inside the launcher.
  Set the Chrome path in Settings if it isn't found automatically.
- **Unity Asset Store**: the store opens like the others and lists your purchases (assetstore.unity.com, My Assets). Unity delivers packages through its Package Manager, so use **Scan Unity Asset Store downloads** to import packages you've already downloaded there. They can only be sent to Unity projects: copied as a `.unitypackage` for you to double-click, or imported automatically if you set the Unity editor path in Settings (the project must be closed).
- **DAZ 3D**: listed like the other stores, but DAZ content is in Daz's own formats. Export from Daz Studio (FBX or glTF, e.g. via the Daz to Blender/Unreal/Unity bridges) and drag the export into the launcher.
- **Anything else**: drag files, folders or zips onto the window.
- **Page snapshots**: in any store window, Ctrl+Shift+S saves a cleaned copy of the current page (scripts, forms, inline data and long tokens removed) to the launcher data folder under `snapshots/`. It is meant for building a store-specific purchase lister. Skim it before sharing, since it still contains visible page text.
- **Library tools**: filter by source and by downloaded / not downloaded, sort by newest, name or source, and use "Download N shown" to fetch many Sketchfab models in one go (asks first above 25, and can be stopped). Your sort order and selected project are remembered; filters reset on each start so nothing stays hidden by accident. Titles owned in more than one store are flagged "Also in: ..." and can be listed with the Duplicates filter.
- **Library folder**: Settings, Library folder, moves all downloaded assets to another drive (copies first, switches over only when everything copied, then removes the old copies).
- **Status panel**: Settings shows whether Chrome was found, whether the sign-in step is done, and how many items each store has synced and when, for diagnosing store connections.
- **Asset details**: click a card's title to see its files and sizes, open its store page, view where you've sent it before, and choose which file format to send (useful for Blender and Unreal, which import one file).
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
