const $ = id => document.getElementById(id);
chrome.storage.local.get({ token: '', port: 47821 }).then(s => { $('token').value = s.token; $('port').value = s.port; test(); });
async function test() {
  const r = await chrome.runtime.sendMessage({ type: 'ping' });
  $('msg').className = r.ok ? 'ok' : 'bad';
  $('msg').textContent = r.ok ? 'Connected to the launcher' : 'Not connected: ' + r.error + ' (is the launcher running?)';
}
$('save').onclick = async () => {
  await chrome.storage.local.set({ token: $('token').value.trim(), port: Number($('port').value) || 47821 });
  test();
};
$('open').onclick = () => chrome.tabs.create({ url: 'tiko-launcher://focus' });
