importScripts('shared.js');
const { storeForHost } = TikoShared;

async function settings() {
  const s = await chrome.storage.local.get({ token: '', port: 47821 });
  return s;
}

async function post(path, body) {
  const { token, port } = await settings();
  if (!token) throw new Error('not paired');
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-tiko-token': token },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`launcher said ${res.status}`);
  return res.json();
}

const badge = (text, color) => { chrome.action.setBadgeText({ text }); chrome.action.setBadgeBackgroundColor({ color }); };

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'items') {
    post('/items', { store: msg.store, items: msg.items, pageUrl: msg.pageUrl })
      .then(r => badge(String(r.added || ''), '#2f6fed'))
      .catch(() => badge('!', '#c0392b'));
  } else if (msg.type === 'ping') {
    post('/ping').then(() => reply({ ok: true }), e => reply({ ok: false, error: e.message }));
    return true;
  }
});

// A finished download that came from (or was started on) a supported store.
chrome.downloads.onChanged.addListener(async delta => {
  if (!delta.state || delta.state.current !== 'complete') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  const hosts = [item.referrer, item.finalUrl, item.url].map(u => { try { return new URL(u).hostname; } catch { return ''; } });
  const store = hosts.map(storeForHost).find(Boolean);
  if (!store || !item.filename) return;
  post('/download', { store, path: item.filename, referrer: item.referrer }).catch(() => badge('!', '#c0392b'));
});
