// Provider plugin shape: { id, name, auth, sync({token, library}), download({asset, token, library}) }
// Drop a new file in this folder and register it here to add an API-backed store.
const sketchfab = require('./sketchfab');
module.exports = { api: { [sketchfab.id]: sketchfab }, browser: require('./browser') };
