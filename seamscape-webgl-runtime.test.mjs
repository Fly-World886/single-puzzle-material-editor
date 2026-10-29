import test from 'node:test';
import assert from 'node:assert/strict';
import { installSeamscapeWebglRuntime } from './seamscape-webgl-runtime.mjs';

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { const entries = listeners.get(type) ?? []; entries.push(listener); listeners.set(type, entries); },
    removeEventListener(type, listener) { listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener)); },
    dispatch(type, event) { for (const listener of listeners.get(type) ?? []) listener(event); },
  };
}

test('control reports ready to its host and cannot send real input before both boards are ready', () => {
  const canvas = eventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const controlWindow = eventTarget();
  controlWindow.location = { search: '?editorPreview=1&editorRole=control&editorSession=test', origin: 'http://local.test' };
  const host = { postMessage: (message) => hostMessages.push(message) };
  controlWindow.parent = host;
  controlWindow.opener = null;
  const hostMessages = [];
  const channel = { postMessage: (packet) => packets.push(packet), addEventListener() {}, removeEventListener() {} };
  const packets = [];
  const documentRef = eventTarget();
  documentRef.querySelector = () => canvas;
  const unity = { SendMessage() {} };
  const dispose = installSeamscapeWebglRuntime({ unityInstance: unity, windowRef: controlWindow, documentRef, channel });
  assert.deepEqual(hostMessages[0], { type: 'seamscape.preview.ready', role: 'control' });
  const pointer = { isTrusted: true, type: 'pointerdown', clientX: 50, clientY: 50, pointerId: 1, button: 0, buttons: 1,
    preventDefault() {}, stopImmediatePropagation() {} };
  canvas.dispatch('pointerdown', pointer);
  assert.equal(packets.length, 0);
  controlWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.level', payload: { revision: 4 } } });
  controlWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.input-enabled', revision: 3, enabled: true } });
  canvas.dispatch('pointerdown', pointer);
  assert.equal(packets.length, 0);
  controlWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.input-enabled', revision: 4, enabled: true } });
  canvas.dispatch('pointerdown', pointer);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].revision, 4);
  dispose();
});

test('forwards HUD visibility updates to the Unity preview bridge', () => {
  const canvas = eventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const controlWindow = eventTarget();
  controlWindow.location = { search: '?editorPreview=1&editorRole=control&editorSession=test', origin: 'http://local.test' };
  const host = { postMessage() {} };
  controlWindow.parent = host;
  const documentRef = eventTarget();
  documentRef.querySelector = () => canvas;
  const sent = [];
  const unity = { SendMessage(...args) { sent.push(args); } };
  const dispose = installSeamscapeWebglRuntime({ unityInstance: unity, windowRef: controlWindow, documentRef });
  controlWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.hud', visible: false } });
  controlWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.hud', visible: true } });
  assert.deepEqual(sent, [
    ['SeamscapePreviewBridge', 'SetHudVisible', '1'],
    ['SeamscapePreviewBridge', 'SetHudVisible', '0'],
    ['SeamscapePreviewBridge', 'SetHudVisible', '1'],
  ]);
  dispose();
});

test('demo shows the source finger image at the mirrored pointer and removes it on dispose', () => {
  const canvas = eventTarget();
  canvas.getBoundingClientRect = () => ({ left: 20, top: 30, width: 960, height: 540 });
  const demoWindow = eventTarget();
  demoWindow.location = { search: '?editorPreview=1&editorRole=demo&editorSession=test', origin: 'http://local.test' };
  const host = { postMessage() {} };
  demoWindow.opener = host;
  demoWindow.parent = null;
  let resizeCallback;
  demoWindow.ResizeObserver = class {
    constructor(callback) { resizeCallback = callback; }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const finger = { style: {}, appendChild(element) { this.child = element; }, remove() { this.removed = true; } };
  const fingerImage = { style: {} };
  const documentRef = eventTarget();
  documentRef.querySelector = () => canvas;
  documentRef.createElement = (tag) => tag === 'div' ? finger : fingerImage;
  documentRef.body = { appendChild(element) { this.child = element; } };
  const listeners = new Map();
  const channel = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
  };
  const sent = [];
  const unity = { SendMessage(...args) { sent.push(args); } };
  const dispose = installSeamscapeWebglRuntime({ unityInstance: unity, windowRef: demoWindow, documentRef, channel });
  demoWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.level', payload: { revision: 2 } } });
  demoWindow.dispatch('message', { source: host, origin: 'http://local.test', data: { type: 'seamscape.preview.input-enabled', revision: 2, enabled: true } });
  listeners.get('message')({ data: {
    protocol: 'seamscape.webgl.input.v1', sessionId: 'test', streamId: 'stream', sequence: 0,
    revision: 2, type: 'pointerdown', x: 0.5, y: 0.25, buttons: 1, deltaX: 0, deltaY: 0,
  } });
  assert.equal(fingerImage.src, 'http://local.test/resources/images/ui/Finger.png');
  assert.equal(finger.style.width, '150px');
  assert.equal(finger.style.height, '150px');
  assert.equal(finger.style.left, '488.75px');
  assert.equal(finger.style.top, '116.25px');
  assert.equal(finger.style.transform, 'scale(0.9)');
  assert.equal(finger.style.pointerEvents, 'none');
  assert.equal(fingerImage.style.transform, 'scaleX(-1)');
  assert.equal(sent.length, 3);
  resizeCallback();
  dispose();
  assert.equal(finger.removed, true);
});
