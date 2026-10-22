// Drives the user's own installed Chrome/Edge, started by the launcher with a
// dedicated profile (sign in once, sync brings passwords and autofill) and a
// local-only DevTools port. While it runs we read library listings from the
// store pages' JSON responses and capture the downloads made there.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Cdp } = require('./cdp');
const { storeForHost } = require('../../extension/shared');
const { harvestResponse, ingestFile } = require('./ingest');

function findChrome(custom) {
  if (custom && fs.existsSync(custom)) return custom;
  const env = process.env;
  const cands = {
    win32: [
      env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
      env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
      env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
  }[process.platform] || [];
  return cands.find(p => p && !p.startsWith('undefined') && fs.existsSync(p)) || null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function moveFile(src, dest) {
  try { fs.renameSync(src, dest); } catch { fs.copyFileSync(src, dest); fs.rmSync(src); }
}

function createChromeBridge({ library, profileDir, stagingDir, getChromePath, downloadsDir, hooks }) {
  let cdp = null;
  let spawning = null;
  let pendingAsset = null;
  const pages = new Map();       // sessionId -> { targetId, url, reqs: Map }
  const byTarget = new Map();    // targetId -> sessionId
  const downloads = new Map();   // guid -> { url, filename }
  let lastStorePage = null;      // { store, url } most recently seen store tab URL

  const portFile = () => path.join(profileDir, 'DevToolsActivePort');

  async function tryConnect() {
    let text;
    try { text = fs.readFileSync(portFile(), 'utf8'); } catch { return false; }
    const [port, wsPath] = text.split('\n');
    if (!/^\d+$/.test(port) || !wsPath) return false;
    const c = new Cdp(`ws://127.0.0.1:${port}${wsPath.trim()}`);
    try { await c.ready(); } catch { return false; }
    cdp = c;
    c.on('close', () => { if (cdp === c) { cdp = null; pages.clear(); byTarget.clear(); hooks.onState && hooks.onState('Launcher Chrome closed'); } });
    c.on('event', onEvent);
    await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: stagingDir, eventsEnabled: true });
    await c.send('Target.setDiscoverTargets', { discover: true });
    return true;
  }

  async function attach(targetId) {
    if (byTarget.has(targetId)) return;
    byTarget.set(targetId, null);
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      byTarget.set(targetId, sessionId);
      const page = pages.get(sessionId) || { targetId, url: '', reqs: new Map() };
      pages.set(sessionId, page);
      await cdp.send('Network.enable', {}, sessionId);
    } catch { byTarget.delete(targetId); }
  }

  function setUrl(info) {
    const sid = byTarget.get(info.targetId);
    const page = sid && pages.get(sid);
    if (page) page.url = info.url;
    const store = storeForHost((() => { try { return new URL(info.url).hostname; } catch { return ''; } })());
    if (store) lastStorePage = { store, url: info.url };
  }

  function onEvent({ method, params, sessionId }) {
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
      const info = params.targetInfo;
      if (info.type !== 'page') return;
      if (!byTarget.has(info.targetId)) attach(info.targetId).then(() => setUrl(info));
      else setUrl(info);
    } else if (method === 'Target.targetDestroyed') {
      const sid = byTarget.get(params.targetId);
      byTarget.delete(params.targetId);
      if (sid) pages.delete(sid);
    } else if (method === 'Network.responseReceived' && sessionId) {
      const page = pages.get(sessionId);
      if (page && /json/i.test(params.response.mimeType || '') && ['XHR', 'Fetch'].includes(params.type)) page.reqs.set(params.requestId, true);
    } else if (method === 'Network.loadingFinished' && sessionId) {
      const page = pages.get(sessionId);
      if (!page || !page.reqs.delete(params.requestId) || params.encodedDataLength > 8e6) return;
      cdp.send('Network.getResponseBody', { requestId: params.requestId }, sessionId).then(r => {
        const text = r.base64Encoded ? Buffer.from(r.body, 'base64').toString() : r.body;
        const hit = harvestResponse(library, page.url, text);
        if (hit && hit.count) hooks.onItems(hit.store, hit.count);
      }).catch(() => {});
    } else if (method === 'Browser.downloadWillBegin') {
      downloads.set(params.guid, { url: params.url, filename: params.suggestedFilename });
    } else if (method === 'Browser.downloadProgress' && params.state === 'completed') {
      onDownloadDone(params.guid);
    } else if (method === 'Browser.downloadProgress' && params.state === 'canceled') downloads.delete(params.guid);
  }

  function onDownloadDone(guid) {
    const d = downloads.get(guid);
    downloads.delete(guid);
    if (!d) return;
    // Chrome saved it into stagingDir (name may be de-duplicated); take the newest finished file.
    const files = fs.readdirSync(stagingDir).filter(f => !f.endsWith('.crdownload'))
      .map(f => ({ f, t: fs.statSync(path.join(stagingDir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!files.length) return;
    const file = path.join(stagingDir, files[0].f);
    let host = '';
    try { host = new URL(d.url).hostname; } catch {}
    const store = storeForHost(host) || (lastStorePage && lastStorePage.store);
    try {
      if (store) {
        const a = ingestFile(library, store, file, lastStorePage && lastStorePage.url, pendingAsset);
        pendingAsset = null;
        fs.rmSync(file);
        hooks.onDownload(a);
      } else { // not a store download: put it where the user expects it
        const dir = downloadsDir();
        let dest = path.join(dir, files[0].f), n = 1;
        while (fs.existsSync(dest)) dest = path.join(dir, `${path.basename(files[0].f, path.extname(files[0].f))} (${n++})${path.extname(files[0].f)}`);
        moveFile(file, dest);
      }
    } catch (err) { console.error('chrome download handling failed', err); hooks.onState && hooks.onState('Could not import download: ' + err.message); }
  }

  async function launch(url) {
    const exe = findChrome(getChromePath());
    if (!exe) throw new Error('Chrome or Edge was not found. Set its path in Settings.');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    try { fs.rmSync(portFile()); } catch {}
    spawn(exe, [`--user-data-dir=${profileDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', url],
      { stdio: 'ignore', detached: true }).unref();
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      if (await tryConnect()) return;
    }
    throw new Error('Could not connect to the launcher Chrome. If a launcher Chrome window (for example the sign-in window) is still open, close it and try again.');
  }

  // Plain Chrome on the same profile, with NO debugging port. Google and some stores refuse
  // sign-in in a browser that has one, so logins happen here and the profile is reused for syncing.
  async function signIn(url) {
    const exe = findChrome(getChromePath());
    if (!exe) throw new Error('Chrome or Edge was not found. Set its path in Settings.');
    if (cdp) { // a syncing Chrome holds the profile: close it first
      const c = cdp;
      await new Promise(res => { c.once('close', res); c.send('Browser.close').catch(res); setTimeout(res, 8000); });
      await sleep(800);
    }
    fs.mkdirSync(profileDir, { recursive: true });
    try { fs.rmSync(portFile()); } catch {}
    const p = spawn(exe, [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', url], { stdio: 'ignore', detached: true });
    p.on('exit', () => hooks.onState && hooks.onState('Sign-in window closed. Click a store to start syncing.'));
    p.unref();
  }

  return {
    signIn,
    isConnected: () => !!cdp,
    async open(url, assetId) {
      if (assetId) pendingAsset = assetId;
      if (spawning) await spawning.catch(() => {});
      if (!cdp && await tryConnect()) { /* attached to a still-running launcher Chrome */ }
      if (cdp) { const { targetId } = await cdp.send('Target.createTarget', { url }); await cdp.send('Target.activateTarget', { targetId }); return; }
      spawning = launch(url);
      try { await spawning; } finally { spawning = null; }
    },
    close() { if (cdp) cdp.close(); }
  };
}

module.exports = { createChromeBridge, findChrome };
