export const InputProtocol = 'seamscape.webgl.input.v1';
const INPUT_TYPES = new Set(['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']);

export function inputChannelName(sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)) {
    throw new TypeError('Invalid editor session id');
  }
  return `seamscape.webgl.input.v1:${sessionId}`;
}

function resolveChannel(channel, sessionId) {
  if (channel) return { channel, owned: false };
  if (typeof BroadcastChannel !== 'function') throw new Error('BroadcastChannel is unavailable');
  return { channel: new BroadcastChannel(inputChannelName(sessionId)), owned: true };
}

function createPacket(event, rect, sequence, sessionId, streamId) {
  if (!Number.isFinite(rect?.width) || rect.width <= 0 || !Number.isFinite(rect?.height) || rect.height <= 0) return null;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const wheel = event.type === 'wheel';
  return {
    protocol: InputProtocol, sessionId, streamId, sequence, type: event.type,
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height),
    pointerId: Number.isFinite(event.pointerId) ? event.pointerId : 0,
    button: Number.isFinite(event.button) ? event.button : 0,
    buttons: Number.isFinite(event.buttons) ? event.buttons : 0,
    deltaX: wheel && Number.isFinite(event.deltaX) ? event.deltaX : 0,
    deltaY: wheel && Number.isFinite(event.deltaY) ? event.deltaY : 0,
  };
}

function validPacket(packet, sessionId, lastSequence) {
  return packet?.protocol === InputProtocol && packet.sessionId === sessionId &&
    typeof packet.streamId === 'string' && packet.streamId.length > 0 &&
    INPUT_TYPES.has(packet.type) && Number.isSafeInteger(packet.sequence) && packet.sequence > lastSequence &&
    Number.isFinite(packet.x) && packet.x >= 0 && packet.x <= 1 &&
    Number.isFinite(packet.y) && packet.y >= 0 && packet.y <= 1 &&
    Number.isFinite(packet.deltaX) && Number.isFinite(packet.deltaY);
}

export function installControlInputMirror(options = {}) {
  const { canvas, sessionId, isEnabled = () => true, getRevision = () => 0, requestAnimationFrame = globalThis.requestAnimationFrame,
    cancelAnimationFrame = globalThis.cancelAnimationFrame } = options;
  if (!canvas?.addEventListener) throw new TypeError('A canvas event target is required');
  const { channel, owned } = resolveChannel(options.channel, sessionId);
  const streamId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  let sequence = 0;
  let frame = null;
  let pendingMove = null;
  const publish = (event, eventRevision = getRevision()) => {
    if (!isEnabled() || eventRevision !== getRevision()) return;
    const packet = createPacket(event, canvas.getBoundingClientRect(), sequence, sessionId, streamId);
    if (!packet) return;
    sequence += 1;
    channel.postMessage({ ...packet, revision: eventRevision });
  };
  const flushMove = () => {
    frame = null;
    if (pendingMove) publish(pendingMove.event, pendingMove.revision);
    pendingMove = null;
  };
  const onInput = (event) => {
    if (event.isTrusted !== true || event.isPrimary === false || !INPUT_TYPES.has(event.type) || !isEnabled()) return;
    if (event.type === 'pointerdown' && Number.isFinite(event.pointerId)) {
      try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture may fail after the browser releases the pointer. */ }
    }
    if (event.type === 'pointermove') {
      pendingMove = { event, revision: getRevision() };
      if (frame == null) frame = requestAnimationFrame(flushMove);
      return;
    }
    if (pendingMove) {
      if (frame != null) cancelAnimationFrame?.(frame);
      flushMove();
    }
    publish(event);
  };
  for (const type of INPUT_TYPES) canvas.addEventListener(type, onInput);
  return () => {
    for (const type of INPUT_TYPES) canvas.removeEventListener(type, onInput);
    if (frame != null) cancelAnimationFrame?.(frame);
    if (owned) channel.close?.();
  };
}

export function installDemoInputMirror(options = {}) {
  const { canvas, sessionId, onRemoteInput } = options;
  if (!canvas?.addEventListener) throw new TypeError('A canvas event target is required');
  const { channel, owned } = resolveChannel(options.channel, sessionId);
  let streamId = null;
  let lastSequence = -1;
  const replay = (event) => {
    const packet = event?.data;
    if (!validPacket(packet, sessionId, -1)) return;
    if (packet?.streamId !== streamId) {
      streamId = packet?.streamId ?? null;
      lastSequence = -1;
    }
    if (!validPacket(packet, sessionId, lastSequence)) return;
    lastSequence = packet.sequence;
    onRemoteInput?.(packet);
  };
  const blockLocal = (event) => {
    if (event.isTrusted !== true) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };
  channel.addEventListener('message', replay);
  const blocked = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mousemove', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart', 'touchmove', 'touchend'];
  for (const type of blocked) canvas.addEventListener(type, blockLocal, { capture: true, passive: false });
  return () => {
    channel.removeEventListener('message', replay);
    for (const type of blocked) canvas.removeEventListener(type, blockLocal, true);
    if (owned) channel.close?.();
  };
}
