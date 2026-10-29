import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeamscapePayload, createSeamscapePreviewBridge, createDualSeamscapePreviewBridge } from './seamscape-preview.mjs';

const level = {
  id: 12,
  enabled: true,
  variants: [{ layout: {
    boardSize: { width: 5, height: 5 },
    matchSize: { width: 5, height: 5 },
    pictures: [{ imagePath: 'images/one.jpg' }],
    queues: Array.from({ length: 5 }, (_, column) => ({
      tiles: Array.from({ length: 5 }, (_, row) => ({ pictureIndex: 0, tileIndex: (4 - row) * 5 + column })),
    })),
  } }],
};

test('maps the current editor level to a Seamscape square preview', () => {
  assert.deepEqual(createSeamscapePayload(level, 3), {
    revision: 3, levelId: 12, boardSize: 5, imagePath: 'images/one.jpg',
    sourceByPosition: Array.from({ length: 25 }, (_, index) => index),
  });
});

test('includes the selected image background in the Unity preview payload', () => {
  assert.equal(createSeamscapePayload(level, 3, 0, 'backgrounds/studio.jpg').backgroundPath,
    'backgrounds/studio.jpg');
});

test('includes the selected video background type in the Unity preview payload', () => {
  assert.deepEqual(createSeamscapePayload(level, 3, 0, 'backgrounds/loop.mp4', 'video'), {
    revision: 3, levelId: 12, boardSize: 5, imagePath: 'images/one.jpg',
    backgroundPath: 'backgrounds/loop.mp4', backgroundType: 'video',
    sourceByPosition: Array.from({ length: 25 }, (_, index) => index),
  });
});

test('includes non-default background sizing in the Unity preview payload', () => {
  assert.deepEqual(createSeamscapePayload(level, 3, 0, 'backgrounds/loop.mp4', 'video', 'contain', 1.35), {
    revision: 3, levelId: 12, boardSize: 5, imagePath: 'images/one.jpg',
    backgroundPath: 'backgrounds/loop.mp4', backgroundType: 'video',
    backgroundFit: 'contain', backgroundScale: 1.35,
    sourceByPosition: Array.from({ length: 25 }, (_, index) => index),
  });
});

test('includes precise background width and height in the Unity preview payload', () => {
  assert.deepEqual(createSeamscapePayload(level, 3, 0, 'backgrounds/studio.jpg', 'image', 'cover', 1, 1.25, 0.8), {
    revision: 3, levelId: 12, boardSize: 5, imagePath: 'images/one.jpg',
    backgroundPath: 'backgrounds/studio.jpg', backgroundType: 'image',
    backgroundWidth: 1.25, backgroundHeight: 0.8,
    sourceByPosition: Array.from({ length: 25 }, (_, index) => index),
  });
});

test('includes the editor tile order in a playable full-board payload', () => {
  const board = structuredClone(level);
  board.variants[0].layout.boardSize = { width: 3, height: 3 };
  board.variants[0].layout.matchSize = { width: 3, height: 3 };
  board.variants[0].layout.queues = [0, 1, 2].map((column) => ({
    tiles: [0, 1, 2].map((row) => ({ pictureIndex: 0, tileIndex: (2 - row) * 3 + column })),
  }));
  const payload = createSeamscapePayload(board, 4);
  assert.deepEqual(payload.sourceByPosition, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  [board.variants[0].layout.queues[0].tiles[2], board.variants[0].layout.queues[1].tiles[2]] =
    [board.variants[0].layout.queues[1].tiles[2], board.variants[0].layout.queues[0].tiles[2]];
  assert.deepEqual(createSeamscapePayload(board, 5).sourceByPosition, [1, 0, 2, 3, 4, 5, 6, 7, 8]);
});

test('plays the selected picture from a level library using the existing board order', () => {
  const board = structuredClone(level);
  board.variants[0].layout.pictures.push({ imagePath: 'images/two.jpg' });
  assert.deepEqual(createSeamscapePayload(board, 6, 1), {
    revision: 6, levelId: 12, boardSize: 5, imagePath: 'images/two.jpg',
    sourceByPosition: Array.from({ length: 25 }, (_, index) => index),
  });
});

test('rejects layouts that Seamscape cannot play rather than silently using the old board', () => {
  const board = structuredClone(level);
  board.variants[0].layout.queues = Array.from({ length: 5 }, (_, column) => ({
    tiles: Array.from({ length: 5 }, (_, row) => ({ pictureIndex: 0, tileIndex: (4 - row) * 5 + column })),
  }));
  board.variants[0].layout.queues[0].tiles.push({ pictureIndex: 0, tileIndex: 0 });
  assert.throws(() => createSeamscapePayload(board, 1), /队列/);
  board.variants[0].layout.queues[0].tiles.pop();
  board.variants[0].layout.pictures.push({ imagePath: 'images/two.jpg' });
  assert.throws(() => createSeamscapePayload(board, 1, 2), /图片/);
});

test('rejects a level that cannot supply a square image preview', () => {
  assert.throws(() => createSeamscapePayload({ ...level, variants: [{ layout: { ...level.variants[0].layout, pictures: [] } }] }, 1), /图片/);
  assert.throws(() => createSeamscapePayload({ ...level, variants: [{ layout: { ...level.variants[0].layout, boardSize: { width: 5, height: 4 } } }] }, 1), /棋盘/);
  assert.throws(() => createSeamscapePayload({ ...level, variants: [{ layout: { ...level.variants[0].layout, pictures: [{ imagePath: '../outside.png' }] } }] }, 1), /路径/);
});

test('sends the newest level after WebGL becomes ready and ignores unrelated messages', () => {
  const listeners = new Map();
  const sent = [];
  const statuses = [];
  const child = { postMessage: (message, origin) => sent.push({ message, origin }) };
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const bridge = createSeamscapePreviewBridge({ iframe: { contentWindow: child }, host, origin: 'http://127.0.0.1:1234', onStatus: (status) => statuses.push(status) });
  bridge.start();
  bridge.publish(level);
  assert.equal(sent.length, 0);
  listeners.get('message')({ origin: 'http://evil.test', source: child, data: { type: 'seamscape.preview.ready' } });
  assert.equal(sent.length, 0);
  listeners.get('message')({ origin: 'http://127.0.0.1:1234', source: child, data: { type: 'seamscape.preview.ready' } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.payload.levelId, 12);
  listeners.get('message')({ origin: 'http://127.0.0.1:1234', source: child, data: { type: 'seamscape.preview.result', status: 'applied', revision: 1 } });
  assert.equal(statuses.at(-1), '关卡已进入游戏');
  bridge.dispose();
  assert.equal(listeners.has('message'), false);
});

test('forwards playable WebGL level requests only from the active local game', () => {
  const listeners = new Map();
  const requested = [];
  const child = {};
  const origin = 'http://127.0.0.1:1234';
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: () => {} };
  const bridge = createSeamscapePreviewBridge({
    iframe: { contentWindow: child }, host, origin,
    onLevelRequest: (levelId) => requested.push(levelId),
  });
  const receive = listeners.get('message');
  receive({ origin, source: child, data: { type: 'seamscape.preview.request-level', levelId: 13 } });
  bridge.start();
  receive({ origin: 'http://other.test', source: child, data: { type: 'seamscape.preview.request-level', levelId: 13 } });
  receive({ origin, source: {}, data: { type: 'seamscape.preview.request-level', levelId: 13 } });
  receive({ origin, source: child, data: { type: 'seamscape.preview.request-level', levelId: 0 } });
  receive({ origin, source: child, data: { type: 'seamscape.preview.request-level', levelId: 13 } });
  assert.deepEqual(requested, [13]);
  bridge.stop();
  receive({ origin, source: child, data: { type: 'seamscape.preview.request-level', levelId: 14 } });
  assert.deepEqual(requested, [13]);
});

test('clears a pending board update when the editor layout becomes unsupported', async () => {
  const listeners = new Map();
  const sent = [];
  const child = { postMessage: (message) => sent.push(message) };
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} };
  const bridge = createSeamscapePreviewBridge({ iframe: { contentWindow: child }, host,
    origin: 'http://127.0.0.1:1234', delayMs: 5 });
  bridge.start();
  listeners.get('message')({ origin: 'http://127.0.0.1:1234', source: child,
    data: { type: 'seamscape.preview.ready' } });
  bridge.publish(level);
  bridge.clear();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(sent.length, 0);
  bridge.dispose();
});

test('synchronizes the same latest level independently to the control iframe and demo popup', async () => {
  const listeners = new Map();
  const sent = [];
  const child = { postMessage: (message, origin) => sent.push({ to: 'control', message, origin }) };
  const popup = { postMessage: (message, origin) => sent.push({ to: 'demo', message, origin }), closed: false };
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} };
  const bridge = createDualSeamscapePreviewBridge({
    controlIframe: { contentWindow: child }, demoUrl: '/seamscape/', origin: 'http://local.test',
    sessionId: 'session-1', host, openWindow: () => popup, delayMs: 0,
  });
  bridge.startControl();
  bridge.publish(level);
  bridge.openDemo();
  const receive = listeners.get('message');
  receive({ origin: 'http://local.test', source: child, data: { type: 'seamscape.preview.result', status: 'applied', revision: 1 } });
  receive({ origin: 'http://evil.test', source: popup, data: { type: 'seamscape.preview.ready', role: 'demo' } });
  receive({ origin: 'http://local.test', source: {}, data: { type: 'seamscape.preview.ready', role: 'control' } });
  assert.equal(sent.length, 0);
  receive({ origin: 'http://local.test', source: child, data: { type: 'seamscape.preview.ready', role: 'control' } });
  receive({ origin: 'http://local.test', source: popup, data: { type: 'seamscape.preview.ready', role: 'demo' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const levels = sent.filter((item) => item.to && item.message.type === 'seamscape.preview.level').map(({ to, message }) => [to, message.payload.levelId]);
  assert.deepEqual(levels, [['control', 12], ['control', 12], ['demo', 12]]);
  const payloads = sent.filter((item) => item.message?.type === 'seamscape.preview.level').map((item) => item.message.payload);
  assert.deepEqual(payloads.at(-2), payloads.at(-1));
  bridge.dispose();
});

test('keeps HUD visibility synchronized across both game previews and newly ready endpoints', () => {
  const listeners = new Map();
  const sent = [];
  const child = { postMessage: (message) => sent.push({ to: 'control', message }) };
  const popup = { postMessage: (message) => sent.push({ to: 'demo', message }), closed: false };
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} };
  const bridge = createDualSeamscapePreviewBridge({ controlIframe: { contentWindow: child },
    origin: 'http://local.test', sessionId: 'hud-test', host, openWindow: () => popup });
  bridge.setHudVisible(false);
  bridge.startControl();
  const receive = listeners.get('message');
  receive({ origin: 'http://local.test', source: child, data: { type: 'seamscape.preview.ready' } });
  bridge.openDemo();
  receive({ origin: 'http://local.test', source: popup, data: { type: 'seamscape.preview.ready' } });
  assert.deepEqual(sent.filter(({ message }) => message.type === 'seamscape.preview.hud').slice(-2), [
    { to: 'control', message: { type: 'seamscape.preview.hud', visible: false } },
    { to: 'demo', message: { type: 'seamscape.preview.hud', visible: false } },
  ]);
  bridge.setHudVisible(true);
  assert.deepEqual(sent.slice(-2), [
    { to: 'control', message: { type: 'seamscape.preview.hud', visible: true } },
    { to: 'demo', message: { type: 'seamscape.preview.hud', visible: true } },
  ]);
  bridge.dispose();
});

test('opens a role-tagged demo URL and resends the cached level after the popup reloads', async () => {
  const listeners = new Map();
  const sent = [];
  let popupSink;
  const popup = { postMessage: (message) => popupSink?.(message), closed: false };
  const child = { postMessage: (message) => sent.push({ to: 'control', message }) };
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} };
  const bridge = createDualSeamscapePreviewBridge({ controlIframe: { contentWindow: child },
    demoUrl: '/seamscape/?editorPreview=1', origin: 'http://local.test', sessionId: 'abc', host,
    openWindow: (url) => { sent.push({ url }); popupSink = (message) => sent.push({ to: 'demo', message }); return popup; }, delayMs: 0 });
  bridge.startControl();
  bridge.publish(level);
  bridge.openDemo();
  assert.match(sent[0].url, /editorRole=demo/);
  assert.match(sent[0].url, /editorSession=abc/);
  const receive = listeners.get('message');
  receive({ origin: 'http://local.test', source: child, data: { type: 'seamscape.preview.ready', role: 'control' } });
  receive({ origin: 'http://local.test', source: popup, data: { type: 'seamscape.preview.ready', role: 'demo' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  popupSink = (message) => sent.push({ to: 'demo-reload', message });
  bridge.openDemo();
  receive({ origin: 'http://local.test', source: popup, data: { type: 'seamscape.preview.ready', role: 'demo' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.filter((item) => item.to === 'demo-reload' && item.message.type === 'seamscape.preview.level').length, 1);
  assert.equal(sent.findLast((item) => item.to === 'demo-reload' && item.message.type === 'seamscape.preview.level').message.payload.levelId, 12);
  bridge.dispose();
});
