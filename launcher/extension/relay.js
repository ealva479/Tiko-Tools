// Isolated-world bridge: page script -> extension background.
window.addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin || !e.data || !e.data.tikoItems) return;
  const { store, items, pageUrl } = e.data.tikoItems;
  if (typeof store === 'string' && Array.isArray(items)) chrome.runtime.sendMessage({ type: 'items', store, items, pageUrl });
});
