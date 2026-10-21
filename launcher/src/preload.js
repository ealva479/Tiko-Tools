const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = ch => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('tiko', {
  list: call('library:list'), remove: call('library:remove'), setTags: call('library:setTags'),
  getConfig: call('config:get'), setConfig: call('config:set'),
  sync: call('provider:sync'), download: call('asset:download'),
  openStore: call('store:open'), stores: call('store:list'),
  addLocal: call('local:add'), addPaths: call('local:addPaths'),
  addProject: call('project:add'), removeProject: call('project:remove'),
  send: call('asset:send'), reveal: call('asset:reveal'), setThumb: call('asset:setThumb'), pickFile: call('pick:file'),
  pathOf: f => webUtils.getPathForFile(f),
  onSnapshot: cb => ipcRenderer.on('snapshot:saved', (_e, f) => cb(f)),
  onAdded: cb => ipcRenderer.on('library:added', (_e, a) => cb(a))
});
