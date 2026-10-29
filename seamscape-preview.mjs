export function createSeamscapePayload(level, revision, pictureIndex = 0, backgroundPath = null,
  backgroundType = 'image', backgroundFit = 'cover', backgroundScale = 1, backgroundWidth = 1, backgroundHeight = 1) {
  const layout = level?.variants?.[0]?.layout;
  const size = layout?.boardSize?.width;
  if (!Number.isInteger(level?.id) || level.id < 1 || level.enabled !== true) throw new Error('关卡无效');
  if (!Number.isInteger(size) || size < 3 || size > 7 || layout.boardSize.height !== size) throw new Error('Seamscape 需要 3 到 7 格的方形棋盘');
  if (!Array.isArray(layout.pictures) || layout.pictures.length === 0) throw new Error('当前关卡没有可试玩图片');
  if (layout.matchSize?.width !== size || layout.matchSize?.height !== size) throw new Error('切片规格必须与 Seamscape 棋盘相同');
  if (!Array.isArray(layout.queues) || layout.queues.length !== size) throw new Error('关卡队列列数无效');
  const picture = layout.pictures?.[pictureIndex];
  if (!picture) throw new Error('当前关卡没有可试玩图片');
  const imagePath = picture.imagePath;
  if (typeof imagePath !== 'string' || !imagePath || imagePath.startsWith('/') || imagePath.includes('..') || imagePath.includes('\\') || /[:?#]/.test(imagePath)) {
    throw new Error('图片路径无效');
  }
  const sourceByPosition = Array(size * size);
  const seen = new Set();
  for (let column = 0; column < size; column += 1) {
    const tiles = layout.queues[column]?.tiles;
    if (!Array.isArray(tiles) || tiles.length !== size) throw new Error('Seamscape 当前只支持满格棋盘，队列不能有额外或缺失切片');
    for (let queueIndex = 0; queueIndex < size; queueIndex += 1) {
      const tile = tiles[queueIndex];
      if (tile?.pictureIndex !== 0 || !Number.isInteger(tile.tileIndex) ||
          tile.tileIndex < 0 || tile.tileIndex >= size * size || seen.has(tile.tileIndex)) {
        throw new Error('关卡切片必须各出现一次，不能重复或缺失');
      }
      seen.add(tile.tileIndex);
      sourceByPosition[(size - 1 - queueIndex) * size + column] = tile.tileIndex;
    }
  }
  const payload = { revision, levelId: level.id, boardSize: size, imagePath, sourceByPosition };
  if (backgroundPath != null) {
    if (typeof backgroundPath !== 'string' || backgroundPath.length === 0 ||
        backgroundPath.startsWith('/') || backgroundPath.includes('..') ||
        backgroundPath.includes('\\') || /[:?#]/.test(backgroundPath)) {
      throw new Error('背景路径无效');
    }
    payload.backgroundPath = backgroundPath;
    payload.backgroundType = backgroundType === 'video' ? 'video' : 'image';
    const fit = ['cover', 'contain', 'stretch'].includes(backgroundFit) ? backgroundFit : 'cover';
    const scale = Number(backgroundScale);
    const normalizedScale = Number.isFinite(scale) ? Math.min(2, Math.max(0.5, scale)) : 1;
    const width = Number(backgroundWidth);
    const height = Number(backgroundHeight);
    const normalizedWidth = Number.isFinite(width) ? Math.min(2, Math.max(0.5, width)) : 1;
    const normalizedHeight = Number.isFinite(height) ? Math.min(2, Math.max(0.5, height)) : 1;
    if (fit !== 'cover') payload.backgroundFit = fit;
    if (normalizedScale !== 1) payload.backgroundScale = normalizedScale;
    if (normalizedWidth !== 1) payload.backgroundWidth = normalizedWidth;
    if (normalizedHeight !== 1) payload.backgroundHeight = normalizedHeight;
  }
  return payload;
}

export function createSeamscapePreviewBridge({ iframe, host = window, origin = window.location.origin, onStatus = () => {}, onLevelRequest = () => {}, delayMs = 200 }) {
  let running = false;
  let ready = false;
  let revision = 0;
  let pending = null;
  let timer = null;
  const send = () => {
    if (running && ready && pending && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'seamscape.preview.level', payload: pending }, origin);
    }
  };
  const receive = (event) => {
    if (!running || event.origin !== origin || event.source !== iframe.contentWindow) return;
    if (event.data?.type === 'seamscape.preview.ready') {
      ready = true;
      onStatus('正在同步关卡…');
      send();
    } else if (event.data?.type === 'seamscape.preview.result' && event.data.revision === pending?.revision) {
      onStatus(event.data.status === 'applied' ? '关卡已进入游戏' : `游玩错误：${event.data.message ?? '未知错误'}`);
    } else if (event.data?.type === 'seamscape.preview.request-level' &&
               Number.isSafeInteger(event.data.levelId) && event.data.levelId > 0) {
      onLevelRequest(event.data.levelId);
    }
  };
  host.addEventListener('message', receive);
  return {
    start() { running = true; ready = false; onStatus('正在加载 Seamscape…'); },
    stop() { running = false; ready = false; clearTimeout(timer); },
    publish(level, pictureIndex = 0, backgroundPath = null, backgroundType = 'image', backgroundFit = 'cover', backgroundScale = 1, backgroundWidth = 1, backgroundHeight = 1) {
      pending = createSeamscapePayload(level, ++revision, pictureIndex, backgroundPath, backgroundType, backgroundFit, backgroundScale, backgroundWidth, backgroundHeight);
      clearTimeout(timer);
      timer = setTimeout(send, delayMs);
    },
    clear() { clearTimeout(timer); pending = null; },
    dispose() { clearTimeout(timer); host.removeEventListener('message', receive); },
  };
}

export function createDualSeamscapePreviewBridge({ controlIframe, demoUrl = '/seamscape/',
  host = window, origin = window.location.origin, sessionId = crypto.randomUUID(),
  openWindow = (...args) => window.open(...args), onControlStatus = () => {},
  onDemoStatus = () => {}, onLevelRequest = () => {}, delayMs = 200 }) {
  const control = { ready: false, applied: false, status: onControlStatus };
  const demo = { ready: false, applied: false, status: onDemoStatus, window: null };
  let running = false;
  let revision = 0;
  let pending = null;
  let hudVisible = true;
  let timer = null;
  const makeUrl = (role) => {
    const url = new URL(demoUrl, origin);
    url.searchParams.set('editorPreview', '1');
    url.searchParams.set('editorRole', role);
    url.searchParams.set('editorSession', sessionId);
    return url.href;
  };
  const target = (endpoint) => endpoint === control ? controlIframe.contentWindow : demo.window;
  const demoOpen = () => demo.window && !demo.window.closed;
  const post = (endpoint, message) => {
    const destination = target(endpoint);
    if (destination && !destination.closed) destination.postMessage(message, origin);
  };
  const setInput = (enabled) => {
    for (const endpoint of [control, demo]) {
      if (endpoint.ready) post(endpoint, { type: 'seamscape.preview.input-enabled', enabled, revision: pending?.revision });
    }
  };
  const sendHudVisibility = () => {
    for (const endpoint of [control, demo]) {
      if (endpoint.ready && (endpoint !== demo || demoOpen())) {
        post(endpoint, { type: 'seamscape.preview.hud', visible: hudVisible });
      }
    }
  };
  const send = () => {
    if (!running || !pending) return;
    setInput(false);
    for (const endpoint of [control, demo]) {
      endpoint.applied = false;
      if (!endpoint.ready || (endpoint === demo && !demoOpen())) continue;
      endpoint.status('正在同步关卡…');
      post(endpoint, { type: 'seamscape.preview.level', payload: pending });
    }
  };
  const receive = (event) => {
    if (event.origin !== origin) return;
    const endpoint = event.source === controlIframe.contentWindow ? control :
      demoOpen() && event.source === demo.window ? demo : null;
    if (!endpoint) return;
    const data = event.data;
    if (data?.type === 'seamscape.preview.ready') {
      endpoint.ready = true;
      endpoint.applied = false;
      sendHudVisibility();
      if (!running) { setInput(false); return; }
      // Opening or refreshing Demo restarts both boards from the same layout.
      if (pending) pending = { ...pending, revision: ++revision };
      clearTimeout(timer);
      send();
    } else if (running && data?.type === 'seamscape.preview.result' && data.revision === pending?.revision) {
      endpoint.applied = data.status === 'applied';
      endpoint.status(endpoint.applied ? '关卡已进入游戏' : `游玩错误：${data.message ?? '未知错误'}`);
      setInput(control.applied && (!demoOpen() || demo.applied));
    } else if (running && endpoint === control && data?.type === 'seamscape.preview.request-level' &&
      Number.isSafeInteger(data.levelId) && data.levelId > 0) {
      onLevelRequest(data.levelId);
    }
  };
  host.addEventListener('message', receive);
  const closeMonitor = setInterval(() => {
    if (!demo.window || !demo.window.closed) return;
    demo.window = null;
    demo.ready = demo.applied = false;
    demo.status('演示窗口已关闭');
    if (running && control.applied) setInput(true);
  }, 500);
  closeMonitor.unref?.();
  return {
    controlUrl: makeUrl('control'),
    startControl() { running = true; control.ready = control.applied = false; onControlStatus('正在加载操作端…'); },
    stopControl() {
      running = false;
      clearTimeout(timer);
      setInput(false);
      control.ready = control.applied = false;
      if (demoOpen()) onDemoStatus('操作端已停止');
    },
    openDemo() {
      if (demoOpen()) { demo.window.focus?.(); return demo.window; }
      demo.ready = demo.applied = false;
      demo.window = openWindow(makeUrl('demo'), `seamscape-demo-${sessionId}`, 'popup,width=470,height=940');
      onDemoStatus(demo.window ? '正在加载演示端…' : '弹窗被拦截，请允许后重试');
      setInput(!demoOpen() && control.applied);
      return demo.window;
    },
    setHudVisible(visible) {
      hudVisible = visible === true;
      sendHudVisibility();
    },
    publish(level, pictureIndex = 0, backgroundPath = null, backgroundType = 'image', backgroundFit = 'cover', backgroundScale = 1, backgroundWidth = 1, backgroundHeight = 1) {
      pending = createSeamscapePayload(level, ++revision, pictureIndex, backgroundPath, backgroundType, backgroundFit, backgroundScale, backgroundWidth, backgroundHeight);
      setInput(false);
      clearTimeout(timer);
      timer = setTimeout(send, delayMs);
    },
    clear() { clearTimeout(timer); pending = null; setInput(false); },
    dispose() { clearTimeout(timer); clearInterval(closeMonitor); setInput(false); host.removeEventListener('message', receive); },
  };
}
