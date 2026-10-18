// Engine plugin shape: { id, name, detect(path), importAsset({asset, project, config}) -> message }
const list = [require('./unity'), require('./godot'), require('./unreal'), require('./blender')];
const engines = Object.fromEntries(list.map(e => [e.id, e]));

function detectEngine(p) {
  const fs = require('fs');
  try {
    return list.find(e => { try { return e.detect(p); } catch { return false; } });
  } catch { return null; }
}

module.exports = { engines, detectEngine };
