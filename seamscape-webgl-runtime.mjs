import { installControlInputMirror, installDemoInputMirror } from './seamscape-input-mirror.mjs';

// Installed after Unity starts; the module can arrive before or after its loader.
export function installSeamscapeWebglRuntime({ unityInstance, windowRef = window, documentRef = document, channel } = {}) {
  const params = new URLSearchParams(windowRef.location.search);
  if (params.get('editorPreview') !== '1') return () => {};
  const role = params.get('editorRole') ?? 'control';
  const sessionId = params.get('editorSession') ?? '';
  const host = role === 'demo' ? windowRef.opener : windowRef.parent;
  const origin = windowRef.location.origin;
  const canvas = documentRef.querySelector('#unity-canvas');
  if (!host || host === windowRef || !canvas) return () => {};
  let enabled = false;
  let revision = 0;
  let hudVisible = true;
  let disposeMirror = () => {};
  let remoteFinger = null;
  let resizeObserver = null;
  let lastRemotePacket = null;
  const updateRemoteFinger = (packet) => {
    if (role !== 'demo' || !remoteFinger) return;
    lastRemotePacket = packet;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const size = rect.width * (300 / 1920);
    const pressed = packet.type === 'pointerdown' || (packet.type === 'pointermove' && packet.buttons !== 0);
    remoteFinger.style.width = `${size}px`;
    remoteFinger.style.height = `${size}px`;
    remoteFinger.style.left = `${rect.left + packet.x * rect.width - size * 0.075}px`;
    remoteFinger.style.top = `${rect.top + packet.y * rect.height - size * 0.325}px`;
    remoteFinger.style.transform = pressed ? 'scale(0.9)' : 'scale(1)';
    remoteFinger.style.display = 'block';
  };
  const blockWhileWaiting = (event) => {
    if (event.isTrusted !== true || enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const blocked = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mousemove', 'mouseup', 'click', 'wheel', 'touchstart', 'touchmove', 'touchend'];
  if (role === 'control') for (const type of blocked) canvas.addEventListener(type, blockWhileWaiting, { capture: true, passive: false });
  const blockKeys = (event) => {
    if (role !== 'demo' && enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keyup']) documentRef.addEventListener(type, blockKeys, true);
  const receive = (event) => {
    if (event.source !== host || event.origin !== origin) return;
    const data = event.data;
    if (data?.type === 'seamscape.preview.input-enabled') {
      if (data.enabled !== true || data.revision === revision) enabled = data.enabled === true;
    } else if (data?.type === 'seamscape.preview.hud' && typeof data.visible === 'boolean') {
      hudVisible = data.visible;
      unityInstance.SendMessage('SeamscapePreviewBridge', 'SetHudVisible', hudVisible ? '1' : '0');
    } else if (data?.type === 'seamscape.preview.level' && Number.isSafeInteger(data.payload?.revision)) {
      enabled = false;
      revision = data.payload.revision;
      unityInstance.SendMessage('SeamscapePreviewBridge', 'ReceiveLevelJson', JSON.stringify(data.payload));
    }
  };
  windowRef.addEventListener('message', receive);
  try {
    unityInstance.SendMessage('SeamscapePreviewBridge', 'SetHudVisible', hudVisible ? '1' : '0');
    if (sessionId) {
      const options = { canvas, sessionId, channel, getRevision: () => revision, isEnabled: () => enabled };
      disposeMirror = role === 'demo'
        ? installDemoInputMirror({ ...options, onRemoteInput: (packet) => {
          if (enabled && packet.revision === revision) {
            updateRemoteFinger(packet);
            unityInstance.SendMessage('SeamscapePreviewBridge', 'ReceiveRemoteInputJson', JSON.stringify(packet));
          }
        } })
        : installControlInputMirror(options);
      if (role === 'demo') {
        remoteFinger = documentRef.createElement('div');
        remoteFinger.alt = '';
        Object.assign(remoteFinger.style, {
          position: 'fixed', display: 'none', zIndex: '2147483647',
          pointerEvents: 'none', transformOrigin: '27.5% 82.5%',
        });
        const fingerImage = documentRef.createElement('img');
        fingerImage.alt = '';
        fingerImage.src = new URL('/resources/images/ui/Finger.png', origin).href;
        Object.assign(fingerImage.style, {
          display: 'block', width: '100%', height: '100%',
          transform: 'scaleX(-1)',
        });
        remoteFinger.appendChild(fingerImage);
        documentRef.body.appendChild(remoteFinger);
        if (typeof windowRef.ResizeObserver === 'function') {
          resizeObserver = new windowRef.ResizeObserver(() => {
            if (remoteFinger.style.display !== 'none' && lastRemotePacket) updateRemoteFinger(lastRemotePacket);
          });
          resizeObserver.observe(canvas);
        }
      }
    }
    host.postMessage({ type: 'seamscape.preview.ready', role }, origin);
  } catch (error) {
    host.postMessage({ type: 'seamscape.preview.result', status: 'error', revision, message: error.message }, origin);
  }
  const dispose = () => {
    enabled = false;
    disposeMirror();
    resizeObserver?.disconnect();
    remoteFinger?.remove();
    windowRef.removeEventListener('message', receive);
    for (const type of blocked) canvas.removeEventListener(type, blockWhileWaiting, true);
    for (const type of ['keydown', 'keyup']) documentRef.removeEventListener(type, blockKeys, true);
    windowRef.removeEventListener('pagehide', dispose);
  };
  windowRef.addEventListener('pagehide', dispose);
  return dispose;
}

if (typeof window !== 'undefined') {
  window.__seamscapeInstallPreview = (unityInstance) => {
    if (window.__seamscapePreviewInstalled) return;
    window.__seamscapePreviewInstalled = true;
    installSeamscapeWebglRuntime({ unityInstance });
  };
  if (window.__seamscapeUnityInstance) window.__seamscapeInstallPreview(window.__seamscapeUnityInstance);
}
