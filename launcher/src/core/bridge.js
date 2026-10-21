// Local HTTP bridge for the browser extension. Bound to 127.0.0.1 only.
// Every request except OPTIONS must carry the pairing token, and requests that
// come from a web page origin (anything but chrome-extension://) are refused, so
// a website cannot talk to it even if it guesses the port.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { STORES } = require('../../extension/shared');
const { ingestItems, ingestFile } = require('./ingest');

const MAX_BODY = 2 * 1024 * 1024;

function insideAny(file, dirs) {
  let real;
  try { real = fs.realpathSync(file); } catch { return false; }
  return dirs.some(d => { const rel = path.relative(d, real); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); });
}

function createBridge({ library, getToken, downloadDirs, onItems, onDownload, onSeen }) {
  const tokenOk = given => {
    const want = Buffer.from(String(getToken()));
    const got = Buffer.from(String(given || ''));
    return want.length > 0 && want.length === got.length && crypto.timingSafeEqual(want, got);
  };
  const send = (res, code, body, cors) => {
    res.writeHead(code, { 'content-type': 'application/json', ...(cors ? { 'access-control-allow-origin': cors, 'access-control-allow-headers': 'content-type,x-tiko-token' } : {}) });
    res.end(JSON.stringify(body));
  };

  return http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    if (origin && !origin.startsWith('chrome-extension://') && !origin.startsWith('moz-extension://')) return send(res, 403, { error: 'forbidden origin' });
    const cors = origin || undefined;
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type,x-tiko-token' }); return res.end(); }
    if (!tokenOk(req.headers['x-tiko-token'])) return send(res, 401, { error: 'bad token' }, cors);
    onSeen && onSeen();
    if (req.method === 'GET' && req.url === '/ping') return send(res, 200, { ok: true }, cors);
    if (req.method !== 'POST') return send(res, 404, { error: 'not found' }, cors);

    let body = '', size = 0, dead = false;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { dead = true; send(res, 413, { error: 'too large' }, cors); req.destroy(); } else body += c; });
    req.on('end', () => {
      if (dead) return;
      let msg;
      try { msg = JSON.parse(body); } catch { return send(res, 400, { error: 'bad json' }, cors); }
      if (!msg || !STORES[msg.store] || msg.store === 'other') return send(res, 400, { error: 'unknown store' }, cors);
      try {
        if (req.url === '/items') {
          const n = ingestItems(library, msg.store, msg.items, msg.pageUrl);
          if (n) onItems && onItems(msg.store, n);
          return send(res, 200, { added: n }, cors);
        }
        if (req.url === '/download') {
          if (typeof msg.path !== 'string' || !insideAny(msg.path, downloadDirs())) return send(res, 400, { error: 'file is not inside an allowed downloads folder' }, cors);
          const a = ingestFile(library, msg.store, msg.path, msg.referrer);
          onDownload && onDownload(a);
          return send(res, 200, { id: a.id }, cors);
        }
        send(res, 404, { error: 'not found' }, cors);
      } catch (err) { send(res, 500, { error: String(err.message) }, cors); }
    });
  });
}

module.exports = { createBridge };
