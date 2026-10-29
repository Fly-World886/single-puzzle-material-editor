import test from 'node:test';
import assert from 'node:assert/strict';
import * as mirror from './seamscape-input-mirror.mjs';

function target() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) { const list = handlers.get(type) ?? []; list.push(fn); handlers.set(type, list); },
    removeEventListener(type, fn) { handlers.set(type, (handlers.get(type) ?? []).filter((item) => item !== fn)); },
    emit(type, event) { for (const fn of handlers.get(type) ?? []) fn(event); },
    getBoundingClientRect() { return { left: 10, top: 20, width: 100, height: 200 }; },
  };
}

test('mirrors trusted input in canvas coordinates, flushes moves before up and isolates sessions', () => {
  const canvas = target();
  const packets = [];
  const channel = { postMessage: (packet) => packets.push(packet) };
  let frame;
  const dispose = mirror.installControlInputMirror({ canvas, channel, sessionId: 'editor-a',
    requestAnimationFrame: (fn) => { frame = fn; return 1; }, cancelAnimationFrame() {} });
  const event = (type, x = 60) => ({ type, isTrusted: true, clientX: x, clientY: 120, pointerId: 1, button: 0, buttons: 1 });
  canvas.emit('pointerdown', { ...event('pointerdown'), isTrusted: false });
  assert.equal(packets.length, 0);
  canvas.emit('pointerdown', event('pointerdown'));
  canvas.emit('pointermove', event('pointermove', 70));
  canvas.emit('pointermove', event('pointermove', 80));
  assert.equal(packets.length, 1);
  frame();
  canvas.emit('pointerup', event('pointerup', 80));
  assert.deepEqual(packets.map((p) => p.type), ['pointerdown', 'pointermove', 'pointerup']);
  assert.deepEqual(packets.map((p) => p.sequence), [0, 1, 2]);
  assert.equal(packets[0].x, .5);
  assert.equal(packets[0].y, .5);
  assert.equal(packets[1].x, .7);
  assert.equal(packets[0].sessionId, 'editor-a');
  assert.notEqual(mirror.inputChannelName('editor-a'), mirror.inputChannelName('editor-b'));
  dispose();
  canvas.emit('pointerdown', event('pointerdown'));
  assert.equal(packets.length, 3);
});

test('demo accepts valid ordered input only for its session and blocks physical local input', () => {
  const canvas = target();
  const channel = target();
  const received = [];
  const dispose = mirror.installDemoInputMirror({ canvas, channel, sessionId: 'editor-a', onRemoteInput: (packet) => received.push(packet) });
  const packet = { protocol: 'seamscape.webgl.input.v1', sessionId: 'editor-a', streamId: 'stream-1',
    sequence: 1, type: 'pointerdown', x: .5, y: .4, pointerId: 1, button: 0, buttons: 1, deltaX: 0, deltaY: 0 };
  const send = (data) => channel.emit('message', { data });
  send({ ...packet, sessionId: 'editor-b' });
  send({ ...packet, x: Infinity });
  send(packet);
  send(packet);
  send({ ...packet, sequence: 0 });
  send({ ...packet, sequence: 2, type: 'pointerup' });
  assert.deepEqual(received.map((p) => p.sequence), [1, 2]);
  let blocked = 0;
  canvas.emit('pointerdown', { isTrusted: true, preventDefault: () => blocked++, stopImmediatePropagation: () => blocked++ });
  canvas.emit('pointerdown', { isTrusted: false, preventDefault: () => blocked++ });
  assert.equal(blocked, 2);
  dispose();
  send({ ...packet, sequence: 3 });
  assert.equal(received.length, 2);
});
