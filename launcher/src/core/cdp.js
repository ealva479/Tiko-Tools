const { EventEmitter } = require('events');
const WebSocket = require('ws');

// Minimal Chrome DevTools Protocol client (flattened sessions).
class Cdp extends EventEmitter {
  constructor(url) {
    super();
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      } else this.emit('event', m);
    });
    this.ws.on('close', () => { for (const p of this.pending.values()) p.reject(new Error('closed')); this.pending.clear(); this.emit('close'); });
    this.ws.on('error', () => {});
  }
  ready() {
    return new Promise((res, rej) => { this.ws.once('open', res); this.ws.once('error', rej); });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }), err => { if (err) { this.pending.delete(id); reject(err); } });
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

module.exports = { Cdp };
