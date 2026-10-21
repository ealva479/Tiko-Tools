// Runs inside the store page. Watches the listing JSON the page itself loads
// (only on library-like pages) and passes just the extracted listings
// (id, title, thumbnail, author) to relay.js. Full responses never leave the page.
(() => {
  const { extractItems, STORES, storeForHost } = TikoShared;
  const store = storeForHost(location.hostname);
  if (!store) return;

  const handle = text => {
    try {
      if (!STORES[store].libraryPath.test(location.href) || text.length > 8e6) return;
      const items = extractItems(JSON.parse(text));
      if (items.length) window.postMessage({ tikoItems: { store, items, pageUrl: location.href } }, location.origin);
    } catch {}
  };

  const realFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await realFetch.apply(this, args);
    try { if (/json/i.test(res.headers.get('content-type') || '')) res.clone().text().then(handle); } catch {}
    return res;
  };

  const realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try { if (/json/i.test(this.getResponseHeader('content-type') || '') && (this.responseType === '' || this.responseType === 'text')) handle(this.responseText); } catch {}
    });
    return realSend.apply(this, args);
  };
})();
