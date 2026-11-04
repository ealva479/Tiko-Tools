const fs = require('fs');
const https = require('https');
const http = require('http');

// Streams a URL to disk, following redirects. Auth headers are NOT forwarded
// across hosts, so signed CDN URLs never receive the user's API token.
function download(url, dest, headers = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    lib.get(u, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, u);
        return resolve(download(next.href, dest, next.host === u.host ? headers : {}, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      fs.mkdirSync(require('path').dirname(dest), { recursive: true });
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retries when the API says "too many requests", honouring Retry-After (capped at 60s).
async function getJson(url, headers = {}, tries = 4) {
  for (let i = 0; ; i++) {
    const res = await new Promise((resolve, reject) => {
      https.get(url, { headers }, r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => resolve({ status: r.statusCode, retryAfter: Number(r.headers['retry-after']), body }));
      }).on('error', reject);
    });
    if (res.status === 429 && i < tries - 1) { await sleep(Math.min(60, res.retryAfter || 2 ** (i + 1)) * 1000); continue; }
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    return JSON.parse(res.body);
  }
}

module.exports = { download, getJson };
