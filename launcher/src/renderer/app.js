import * as viewer from './viewer.js';
const $ = s => document.querySelector(s);
let assets = [], config = {}, selProject = null;
const status = t => { $('#status').textContent = t; };
const guard = async (label, fn) => { status(label + '...'); try { const r = await fn(); status(typeof r === 'string' ? r : 'Done'); return r; } catch (e) { status('Error: ' + e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } };

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach(k => n.append(k));
  return n;
}

async function refresh() {
  assets = await tiko.list();
  config = await tiko.getConfig();
  if (!config.projects.find(p => p.path === selProject)) selProject = config.projects[0]?.path ?? null;
  const sel = $('#source'), cur = sel.value;
  sel.replaceChildren(el('option', { value: '', textContent: 'All sources' }), ...[...new Set(assets.map(a => a.provider))].sort().map(v => el('option', { value: v, textContent: v })));
  sel.value = cur;
  renderSources(); renderProjects(); renderGrid();
}

const openStore = (id, url, assetId) => guard('Opening', async () => {
  const r = await tiko.openStore(id, url, assetId);
  if (r.mode === 'embedded') { await tiko.showStore(id, url, assetId); $('#back').hidden = false; return 'Store opened in the launcher'; }
  return r.mode === 'chrome'
    ? 'Opened in the launcher\'s Chrome. Browse your library there; it syncs here automatically.'
    : 'Opened in your browser. Browse or download there; the launcher picks it up.';
});
$('#back').onclick = async () => { await tiko.hideStore(); $('#back').hidden = true; refresh(); };

async function renderSources() {
  const box = $('#sources'); box.replaceChildren();
  box.append(el('button', { textContent: 'Sync Sketchfab (API)', onclick: () => guard('Syncing Sketchfab', async () => `Synced ${await tiko.sync('sketchfab')} models`).then(refresh) }));
  for (const s of await tiko.stores())
    box.append(el('button', { textContent: `${s.name} library`, title: 'Sign in and browse your purchases. Your library is read automatically and downloads are captured. Ctrl+Shift+S saves a page snapshot.', onclick: () => openStore(s.id) }));
}

function renderProjects() {
  const box = $('#projects'); box.replaceChildren();
  for (const p of config.projects) {
    const row = el('div', { className: 'proj' + (p.path === selProject ? ' sel' : ''), ondragover: e => { if (e.dataTransfer.types.includes('text/tiko-asset')) { e.preventDefault(); row.classList.add('over'); } }, ondragleave: () => row.classList.remove('over'), ondrop: e => { const id = e.dataTransfer.getData('text/tiko-asset'); if (!id) return; e.preventDefault(); e.stopPropagation(); row.classList.remove('over'); guard('Importing', () => tiko.send(id, p.path)); }, onclick: () => { selProject = p.path; renderProjects(); renderGrid(); } },
      el('span', {}, p.name, el('small', { textContent: '  ' + p.engine })),
      el('button', { textContent: 'x', onclick: async e => { e.stopPropagation(); await tiko.removeProject(p.path); refresh(); } }));
    box.append(row);
  }
  if (!config.projects.length) box.append(el('small', { textContent: 'Add a Unity, Godot, Unreal or .blend project.' }));
}

function renderGrid() {
  viewer.stop();
  const q = $('#search').value.toLowerCase();
  const grid = $('#grid'); grid.replaceChildren();
  for (const a of assets.filter(a => (!$('#source').value || a.provider === $('#source').value) && `${a.title} ${a.author} ${a.provider} ${(a.tags || []).join(' ')}`.toLowerCase().includes(q))) {
    const thumb = el('div', { className: 'thumb', textContent: a.thumbnail ? '' : a.provider });
    if (a.thumbnail) thumb.style.backgroundImage = `url("${a.thumbnail}")`;
    const actions = el('div', { className: 'actions' });
    if (a.downloaded && viewer.previewFile(a))
      actions.append(el('button', { textContent: '3D', title: 'Interactive 3D preview', onclick: () => preview(a, thumb) }));
    if (!a.downloaded && a.provider === 'sketchfab') actions.append(el('button', { textContent: 'Download', onclick: () => guard('Downloading', () => tiko.download(a.id)).then(refresh) }));
    else if (!a.downloaded) actions.append(el('button', { className: 'primary', textContent: 'Get from ' + a.provider, title: 'Opens the store page; click its download button and the file is added to this card', onclick: () => openStore(a.provider, a.pageUrl, a.id) }));
    else {
      actions.append(el('button', { className: 'primary', textContent: selProject ? 'Send to project' : 'Pick a project', disabled: !selProject, onclick: () => guard('Importing', () => tiko.send(a.id, selProject)) }));
      actions.append(el('button', { textContent: 'Folder', onclick: () => tiko.reveal(a.id) }));
    }
    actions.append(el('button', { textContent: '✕', title: 'Remove from library', onclick: () => tiko.remove(a.id).then(refresh) }));
    const tagBox = el('div', { className: 'tags' });
    const saveTags = tags => tiko.setTags(a.id, tags).then(r => { a.tags = r.tags; renderTags(); });
    const renderTags = () => {
      tagBox.replaceChildren(...(a.tags || []).map(t => el('span', { className: 'tag' }, t, el('b', { textContent: '×', onclick: () => saveTags(a.tags.filter(x => x !== t)) }))),
        el('input', { placeholder: '+ tag', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) saveTags([...(a.tags || []), ...e.target.value.split(',')]); } }));
    };
    renderTags();
    const card = el('div', { className: 'card', draggable: !!a.downloaded, title: a.downloaded ? 'Drag onto a project to import' : '' }, thumb,
      el('div', { className: 'meta' }, el('b', { textContent: a.title, title: a.title }),
        el('small', { textContent: [a.provider, a.author, a.files?.map(f => f.format).filter((v, i, s) => s.indexOf(v) === i).join('/')].filter(Boolean).join(' · ') })),
      tagBox, actions);
    card.ondragstart = e => e.dataTransfer.setData('text/tiko-asset', a.id);
    grid.append(card);
  }
}

async function preview(a, thumb) {
  status('Loading preview...');
  try {
    const snap = await viewer.show(a, thumb);
    status('Drag to orbit, scroll to zoom');
    if (!a.thumbnail) tiko.setThumb(a.id, snap).then(u => { if (u) Object.assign(a, { thumbnail: u.thumbnail }); });
  } catch (e) { viewer.stop(); status('Preview failed: ' + e.message); }
}

$('#search').oninput = renderGrid;
$('#source').onchange = renderGrid;
$('#addLocal').onclick = () => guard('Adding', () => tiko.addLocal()).then(refresh);
$('#addProject').onclick = () => guard('Adding project', () => tiko.addProject()).then(refresh);
$('#settingsBtn').onclick = async () => { await tiko.hideStore(); $('#back').hidden = true;
  const x = await tiko.extStatus(), cfg = await tiko.getConfig();
  $('#extraDir').value = (await tiko.getConfig()).extraDownloadDir || ''; $('#extToken').value = x.token; $('#mode').value = cfg.storeMode || 'chrome'; $('#chromePath').value = cfg.chromePath || '';
  $('#extState').textContent = x.lastSeen ? `Extension connected (last seen ${new Date(x.lastSeen).toLocaleString()}). Port ${x.port}.` : `Extension not connected yet. Port ${x.port}.`; $('#blenderPath').value = config.blenderPath || ''; $('#unrealEditor').value = config.unrealEditor || ''; $('#tokSketchfab').value = ''; $('#settings').showModal(); };
document.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { const f = await tiko.pickFile(); if (f) $('#' + b.dataset.pick).value = f; });
$('#copyTok').onclick = () => navigator.clipboard.writeText($('#extToken').value);
$('#settings').addEventListener('close', async () => {
  if ($('#settings').returnValue !== 'ok') return;
  const patch = { blenderPath: $('#blenderPath').value, unrealEditor: $('#unrealEditor').value, storeMode: $('#mode').value, chromePath: $('#chromePath').value.trim(), extraDownloadDir: $('#extraDir').value.trim() };
  if ($('#tokSketchfab').value) patch.tokens = { sketchfab: $('#tokSketchfab').value };
  await tiko.setConfig(patch); refresh();
});

// Drag & drop of folders, zips and model files.
let depth = 0;
addEventListener('dragenter', e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); depth++; $('#drop').classList.add('on'); });
addEventListener('dragleave', e => { if (!e.dataTransfer.types.includes('Files')) return; if (--depth <= 0) { depth = 0; $('#drop').classList.remove('on'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', async e => {
  e.preventDefault(); depth = 0; $('#drop').classList.remove('on');
  const paths = [...e.dataTransfer.files].map(f => tiko.pathOf(f)).filter(Boolean);
  if (paths.length) { await guard('Adding', () => tiko.addPaths(paths)); refresh(); }
});

tiko.onSnapshot(f => status('Saved page snapshot: ' + f));
let t; tiko.onChanged(msg => { status(msg); clearTimeout(t); t = setTimeout(refresh, 400); });
refresh();
