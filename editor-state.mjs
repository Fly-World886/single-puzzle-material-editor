export function createEditorState(levelId = 1) {
  return {
    levelId,
    sidebarCollapsed: false,
    activeInspectorSection: 'assets',
    activeAssetLibrary: 'project',
    activeInspectorWorkspace: 'project',
    previewHudVisible: true,
    previewRunning: false,
    selectedPictureIndex: null,
    selectedSceneTileSlot: null,
  };
}

export function createEmptyCustomLevel(levelId, firstCustomLevelId) {
  if (!Number.isInteger(levelId) || !Number.isInteger(firstCustomLevelId) || levelId < firstCustomLevelId) return null;
  return {
    id: levelId,
    enabled: true,
    variants: [{
      tier: 1,
      difficulty: 0,
      layout: {
        boardSize: { width: 4, height: 4 },
        matchSize: { width: 4, height: 4 },
        tilePixelSize: { width: 180, height: 260 },
        pictures: [],
        queues: Array.from({ length: 4 }, () => ({ tiles: [] })),
      },
    }],
  };
}

export async function collectUniqueProjectPictures(project, getImageFingerprint) {
  const levels = Array.isArray(project?.levels) ? project.levels : [];
  const pictures = levels.flatMap((level) => (
    Array.isArray(level?.variants)
      ? level.variants.flatMap((variant) => (
        Array.isArray(variant?.layout?.pictures) ? variant.layout.pictures : []
      ))
      : []
  )).filter((picture) => typeof picture?.imagePath === 'string' && picture.imagePath.length > 0);

  const uniquePaths = new Set();
  const picturesWithUniquePaths = pictures.filter((picture) => {
    if (uniquePaths.has(picture.imagePath)) return false;
    uniquePaths.add(picture.imagePath);
    return true;
  });
  if (typeof getImageFingerprint !== 'function') return picturesWithUniquePaths;
  const fingerprints = [];
  for (let offset = 0; offset < picturesWithUniquePaths.length; offset += 16) {
    const batch = picturesWithUniquePaths.slice(offset, offset + 16);
    fingerprints.push(...await Promise.all(batch.map(async (picture) => {
      try {
        return await getImageFingerprint(picture.imagePath);
      } catch {
        return null;
      }
    })));
  }
  const uniqueContents = new Set();
  const uniquePictures = [];

  for (const [index, picture] of picturesWithUniquePaths.entries()) {
    const fingerprint = fingerprints[index];
    if (typeof fingerprint === 'string' && fingerprint.length > 0) {
      if (uniqueContents.has(fingerprint)) continue;
      uniqueContents.add(fingerprint);
    }
    uniquePictures.push(picture);
  }

  return uniquePictures;
}

export function addImportedPictures(importedPictures, incomingPictures, projectFingerprints = []) {
  const pictures = Array.isArray(importedPictures) ? [...importedPictures] : [];
  const knownFingerprints = new Set(
    [...projectFingerprints, ...pictures.map((picture) => picture?.fingerprint)]
      .filter((fingerprint) => typeof fingerprint === 'string' && fingerprint.length > 0),
  );
  let added = 0;
  let skipped = 0;

  for (const picture of Array.isArray(incomingPictures) ? incomingPictures : []) {
    const imagePath = picture?.imagePath;
    const fingerprint = picture?.fingerprint;
    if (typeof imagePath !== 'string' || imagePath.length === 0 ||
      typeof fingerprint !== 'string' || fingerprint.length === 0 || knownFingerprints.has(fingerprint)) {
      skipped += 1;
      continue;
    }
    knownFingerprints.add(fingerprint);
    pictures.push(picture);
    added += 1;
  }

  return { pictures, added, skipped };
}

export function addImportedBackgrounds(importedBackgrounds, incomingBackgrounds) {
  return addImportedPictures(importedBackgrounds, incomingBackgrounds);
}

export function removeImportedPicture(importedPictures, imagePath) {
  const pictures = Array.isArray(importedPictures) ? importedPictures : [];
  if (typeof imagePath !== 'string' || imagePath.length === 0) return { pictures, removed: false };
  const filteredPictures = pictures.filter((picture) => picture?.imagePath !== imagePath);
  return { pictures: filteredPictures, removed: filteredPictures.length !== pictures.length };
}

export function removeImportedBackground(importedBackgrounds, imagePath) {
  return removeImportedPicture(importedBackgrounds, imagePath);
}

export function getGameBackgroundImagePath(selectedBackground) {
  const imagePath = selectedBackground?.imagePath;
  return typeof imagePath === 'string' && imagePath.length > 0
    ? imagePath
    : null;
}

export function getGameBackgroundMediaType(selectedBackground) {
  const mimeType = selectedBackground?.mimeType;
  if (typeof mimeType === 'string' && mimeType.startsWith('video/')) return 'video';
  const imagePath = selectedBackground?.imagePath;
  if (typeof imagePath === 'string' && /\.(?:mp4|webm|mov|m4v|ogv)$/i.test(imagePath)) return 'video';
  return 'image';
}

export function getGameBackgroundFit(selectedBackground) {
  return ['cover', 'contain', 'stretch'].includes(selectedBackground?.fit) ? selectedBackground.fit : 'cover';
}

export function getGameBackgroundScale(selectedBackground) {
  const scale = Number(selectedBackground?.scale);
  return Number.isFinite(scale) ? Math.min(2, Math.max(0.5, scale)) : 1;
}

export function getGameBackgroundWidth(selectedBackground) {
  const width = Number(selectedBackground?.width);
  return Number.isFinite(width) ? Math.min(2, Math.max(0.5, width)) : 1;
}

export function getGameBackgroundHeight(selectedBackground) {
  const height = Number(selectedBackground?.height);
  return Number.isFinite(height) ? Math.min(2, Math.max(0.5, height)) : 1;
}

export function getProjectPictureLibrary(projectPictures, importedPictures) {
  const project = Array.isArray(projectPictures) ? projectPictures : [];
  return project;
}

export function replacePictureInLayout(layout, pictureIndex, replacementPicture) {
  const pictures = Array.isArray(layout?.pictures) ? layout.pictures : null;
  const imagePath = replacementPicture?.imagePath;
  if (pictures == null || !Number.isInteger(pictureIndex) || pictureIndex < 0 || pictureIndex >= pictures.length ||
    typeof imagePath !== 'string' || imagePath.length === 0) {
    return { layout, replaced: false };
  }

  return {
    layout: {
      ...layout,
      pictures: pictures.map((picture, index) => (
        index === pictureIndex ? { ...picture, imagePath } : picture
      )),
    },
    replaced: true,
  };
}

export function addPictureToLayout(layout, picture) {
  const pictures = Array.isArray(layout?.pictures) ? layout.pictures : null;
  const queues = Array.isArray(layout?.queues) ? layout.queues : null;
  const gridSize = Number(layout?.boardSize?.width);
  const matchSize = Number(layout?.matchSize?.width);
  const imagePath = picture?.imagePath;
  if (pictures == null || queues == null || !Number.isInteger(gridSize) || gridSize <= 0 ||
    !Number.isInteger(matchSize) || matchSize <= 0 || queues.length < gridSize ||
    typeof imagePath !== 'string' || imagePath.length === 0) {
    return { layout, added: false, reason: 'invalid' };
  }
  if (pictures.some((candidate) => candidate?.imagePath === imagePath)) {
    return { layout, added: false, reason: 'duplicate' };
  }

  const pictureIndex = pictures.length;
  const nextQueues = queues.map((queue) => ({
    ...queue,
    tiles: Array.isArray(queue?.tiles) ? [...queue.tiles] : [],
  }));
  // The first picture on a blank level must fill the selected board.
  const nextMatchSize = pictures.length === 0 ? gridSize : matchSize;
  const tileCount = nextMatchSize * nextMatchSize;
  for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
    nextQueues[tileIndex % gridSize].tiles.push({ pictureIndex, tileIndex });
  }

  return {
    layout: {
      ...layout,
      matchSize: pictures.length === 0
        ? { width: nextMatchSize, height: nextMatchSize }
        : layout.matchSize,
      pictures: [...pictures, { imagePath }],
      queues: nextQueues,
    },
    pictureIndex,
    added: true,
  };
}

export function addPictureToLevelLibrary(layout, picture) {
  const pictures = Array.isArray(layout?.pictures) ? layout.pictures : null;
  const imagePath = picture?.imagePath;
  if (pictures == null || typeof imagePath !== 'string' || imagePath.length === 0) {
    return { layout, added: false, reason: 'invalid' };
  }
  if (pictures.some((candidate) => candidate?.imagePath === imagePath)) {
    return { layout, added: false, reason: 'duplicate' };
  }
  return {
    layout: { ...layout, pictures: [...pictures, { imagePath }] },
    pictureIndex: pictures.length,
    added: true,
  };
}

const SupportedBoardSizes = new Set([3, 4, 5, 6, 7]);

function safeClone(value) {
  return structuredClone(value);
}

function isSafeDraftBackground(background) {
  if (background == null) return true;
  const imagePath = background?.imagePath;
  return typeof background === 'object' && typeof imagePath === 'string' && imagePath.length > 0 &&
    !imagePath.startsWith('/') && !imagePath.includes('..') && !/^[a-z]+:/i.test(imagePath);
}

export function createDraftPayload(levelId, layout, selectedGameBackground) {
  if (!Number.isInteger(levelId) || levelId <= 0 || layout == null || typeof layout !== 'object') return null;
  return {
    version: 1,
    levelId,
    layout: safeClone(layout),
    selectedGameBackground: selectedGameBackground == null ? null : safeClone(selectedGameBackground),
  };
}

export function getUsableDraft(draft, expectedLevelId) {
  const layout = draft?.layout;
  const width = Number(layout?.boardSize?.width);
  const height = Number(layout?.boardSize?.height);
  if (draft?.version !== 1 || draft?.levelId !== expectedLevelId || !Number.isInteger(expectedLevelId) ||
      !Object.hasOwn(draft, 'selectedGameBackground') ||
      !SupportedBoardSizes.has(width) || width !== height || !Array.isArray(layout?.queues) ||
      !Array.isArray(layout?.pictures) || !isSafeDraftBackground(draft?.selectedGameBackground)) return null;
  return draft;
}

export function changeBoardFormat(layout, targetSize) {
  const size = Number(targetSize);
  if (!SupportedBoardSizes.has(size)) return { layout, changed: false, reason: 'invalid-target' };
  const currentWidth = Number(layout?.boardSize?.width);
  const currentHeight = Number(layout?.boardSize?.height);
  const queues = Array.isArray(layout?.queues) ? layout.queues : null;
  if (!Number.isInteger(currentWidth) || currentWidth <= 0 || currentHeight !== currentWidth || queues == null) {
    return { layout, changed: false, reason: 'invalid-layout' };
  }
  const tiles = queues.flatMap((queue) => (Array.isArray(queue?.tiles) ? queue.tiles : []));
  if (currentWidth === size) return { layout, changed: false, reason: 'unchanged' };
  if (tiles.length === 0 && Array.isArray(layout?.pictures) && layout.pictures.length === 0) {
    return {
      layout: {
        ...layout,
        boardSize: { width: size, height: size },
        matchSize: { width: size, height: size },
        queues: Array.from({ length: size }, () => ({ tiles: [] })),
      },
      changed: true,
      reason: 'empty',
    };
  }
  const currentTileCount = currentWidth * currentWidth;
  const singlePictureBoard = Array.isArray(layout?.pictures) && layout.pictures.length > 0 &&
    queues.length === currentWidth && layout.matchSize?.width === currentWidth &&
    layout.matchSize?.height === currentWidth && tiles.length === currentTileCount &&
    tiles.every((tile) => tile?.pictureIndex === 0 && Number.isInteger(tile.tileIndex) &&
      tile.tileIndex >= 0 && tile.tileIndex < currentTileCount) &&
    new Set(tiles.map((tile) => tile.tileIndex)).size === currentTileCount;
  if (singlePictureBoard) {
    const nextQueues = Array.from({ length: size }, () => ({ tiles: [] }));
    for (let tileIndex = 0; tileIndex < size * size; tileIndex += 1) {
      nextQueues[tileIndex % size].tiles.push({ pictureIndex: 0, tileIndex });
    }
    return {
      layout: {
        ...layout,
        boardSize: { width: size, height: size },
        matchSize: { width: size, height: size },
        queues: nextQueues,
      },
      changed: true,
      reason: 'resliced',
    };
  }
  if (tiles.length < size * size) return { layout, changed: false, reason: 'insufficient-tiles' };
  const nextQueues = Array.from({ length: size }, () => ({ tiles: [] }));
  tiles.forEach((tile, index) => nextQueues[index % size].tiles.push(tile));
  return {
    layout: { ...layout, boardSize: { width: size, height: size }, queues: nextQueues },
    changed: true,
    reason: 'changed',
  };
}

export function removePictureFromLayout(layout, pictureIndex) {
  const pictures = Array.isArray(layout?.pictures) ? layout.pictures : null;
  const queues = Array.isArray(layout?.queues) ? layout.queues : null;
  if (pictures == null || queues == null || !Number.isInteger(pictureIndex) ||
    pictureIndex < 0 || pictureIndex >= pictures.length) {
    return { layout, removed: false, reason: 'invalid' };
  }
  if (pictures.length <= 1) {
    return { layout, removed: false, reason: 'last-picture' };
  }

  const tiles = queues.flatMap((queue) => Array.isArray(queue?.tiles) ? queue.tiles : []);
  const removingOnlyTileSource = tiles.length > 0 && tiles.every((tile) => tile?.pictureIndex === pictureIndex);

  return {
    layout: {
      ...layout,
      pictures: pictures.filter((_, index) => index !== pictureIndex),
      queues: queues.map((queue) => ({
        ...queue,
        tiles: Array.isArray(queue?.tiles)
          ? removingOnlyTileSource
            ? queue.tiles.map((tile) => ({ ...tile, pictureIndex: 0 }))
            : queue.tiles
              .filter((tile) => tile?.pictureIndex !== pictureIndex)
              .map((tile) => (tile?.pictureIndex > pictureIndex
                ? { ...tile, pictureIndex: tile.pictureIndex - 1 }
                : tile))
          : [],
      })),
    },
    removed: true,
  };
}

function positiveNumber(value, fallback) {
  try {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function finiteNumber(value, fallback = 0) {
  try {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizedSceneViewport(viewport = {}) {
  const source = viewport != null && typeof viewport === 'object' ? viewport : {};
  return {
    x: finiteNumber(source.x),
    y: finiteNumber(source.y),
    zoom: Math.min(2, Math.max(0.5, positiveNumber(source.zoom, 1))),
  };
}

export function createSceneViewport() {
  return { x: 0, y: 0, zoom: 1 };
}

export function isScenePanPointerButton(button) {
  return button === 2;
}

export function isEditorUiToggleKey(event = {}) {
  const target = event?.target;
  const tagName = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : '';
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName) || target?.isContentEditable) return false;
  return typeof event?.key === 'string' && event.key.toLowerCase() === 'h' &&
    !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function getSceneViewportPoint(clientX, clientY, canvasRect = {}) {
  return {
    x: finiteNumber(clientX) - finiteNumber(canvasRect.left) - finiteNumber(canvasRect.width) / 2,
    y: finiteNumber(clientY) - finiteNumber(canvasRect.top) - finiteNumber(canvasRect.height) / 2,
  };
}

export function panSceneViewport(viewport, deltaX, deltaY) {
  const current = normalizedSceneViewport(viewport);
  return {
    ...current,
    x: finiteNumber(current.x + finiteNumber(deltaX)),
    y: finiteNumber(current.y + finiteNumber(deltaY)),
  };
}

export function zoomSceneViewportAtPoint(viewport, factor, pointX, pointY) {
  const current = normalizedSceneViewport(viewport);
  const nextZoom = Math.min(2, Math.max(0.5, current.zoom * positiveNumber(factor, 1)));
  const x = finiteNumber(pointX);
  const y = finiteNumber(pointY);

  return {
    x: finiteNumber(x - (x - current.x) * (nextZoom / current.zoom)),
    y: finiteNumber(y - (y - current.y) * (nextZoom / current.zoom)),
    zoom: nextZoom,
  };
}

export function calculateExternalQueueLayout({
  gridSize,
  tilePixelSize,
  queueLengths,
  boardWidth,
  queueHeight,
  mode = 'editor',
} = {}) {
  const columns = Math.max(1, Math.floor(positiveNumber(gridSize, 1)));
  const tileWidthPixels = positiveNumber(tilePixelSize?.width, 1);
  const tileHeightPixels = positiveNumber(tilePixelSize?.height, 1);
  const tileAspect = tileWidthPixels / tileHeightPixels;
  const width = positiveNumber(boardWidth, columns);
  const maxQueueHeight = positiveNumber(queueHeight, 1);
  const longestQueue = Math.max(0, ...(Array.isArray(queueLengths)
    ? queueLengths.map((length) => Math.max(0, Math.floor(Number(length) || 0)))
    : [0]));
  const queueLabelHeight = 15;
  const queueGap = 5;
  const phoneHeight = mode === 'runtime' ? 360 : 380;
  const tileWidth = width / columns;
  const unscaledTileHeight = tileWidth / tileAspect;
  const unscaledQueueTileStep = mode === 'runtime' ? tileWidth / 6 : unscaledTileHeight;
  const unscaledQueueTilesHeight = longestQueue === 0
    ? 0
    : unscaledTileHeight + (longestQueue - 1) * unscaledQueueTileStep;
  const availableTileHeight = Math.max(0, maxQueueHeight - queueLabelHeight);
  const fittedQueueScale = unscaledQueueTilesHeight === 0
    ? 1
    : Math.min(1, availableTileHeight / unscaledQueueTilesHeight);
  const queueScale = fittedQueueScale < 1 ? fittedQueueScale * (1 - 1e-10) : fittedQueueScale;
  const tileHeight = unscaledTileHeight * queueScale;
  const queueTileStep = unscaledQueueTileStep * queueScale;
  const queueTilesHeight = longestQueue === 0
    ? 0
    : tileHeight + (longestQueue - 1) * queueTileStep;
  const resolvedQueueHeight = queueLabelHeight + queueTilesHeight;

  return {
    tileWidth,
    tileHeight,
    queueHeight: resolvedQueueHeight,
    queueTileStep,
    boardWidth: width,
    queueScale,
    compositionHeight: resolvedQueueHeight + queueGap + phoneHeight,
  };
}

export function calculateSceneLayout({
  gridSize,
  tilePixelSize,
  queueLengths,
  containerWidth,
  containerHeight,
  mode = 'editor',
} = {}) {
  const columns = Math.max(1, Math.floor(positiveNumber(gridSize, 1)));
  const tileWidthPixels = positiveNumber(tilePixelSize?.width, 1);
  const tileHeightPixels = positiveNumber(tilePixelSize?.height, 1);
  const tileAspect = tileWidthPixels / tileHeightPixels;
  const width = positiveNumber(containerWidth, columns);
  const height = positiveNumber(containerHeight, columns);
  const longestQueue = Math.max(0, ...(Array.isArray(queueLengths)
    ? queueLengths.map((length) => Math.max(0, Math.floor(Number(length) || 0)))
    : [0]));
  const queueLabelHeight = 15;
  const queueGap = 5;
  const runtime = mode === 'runtime';
  const boardTileWidth = Math.min(width / columns, height / (columns / tileAspect));
  const tileWidth = Math.max(1, boardTileWidth * (1 - 1e-10));
  const tileHeight = tileWidth / tileAspect;
  const queueTileStep = runtime ? tileWidth / 6 : tileHeight;
  const queueTilesHeight = longestQueue === 0
    ? 0
    : tileHeight + (longestQueue - 1) * queueTileStep;
  const queueHeight = queueLabelHeight + queueTilesHeight;
  const boardWidth = tileWidth * columns;
  const boardHeight = tileHeight * columns;
  const totalHeight = queueHeight + queueGap + boardHeight;

  return {
    scale: tileWidth / (width / columns),
    tileAspect,
    tileWidth,
    tileHeight,
    queueTileStep,
    queueLabelHeight,
    queueGap,
    queueHeight,
    boardWidth,
    boardHeight,
    totalHeight,
  };
}

export function swapPicturesByIndex(pictures, sourceIndex, targetIndex) {
  if (!Array.isArray(pictures) || !Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) ||
      sourceIndex < 0 || sourceIndex >= pictures.length || targetIndex < 0 || targetIndex >= pictures.length ||
      sourceIndex === targetIndex) {
    return { pictures, swapped: false };
  }
  const swappedPictures = [...pictures];
  [swappedPictures[sourceIndex], swappedPictures[targetIndex]] =
    [swappedPictures[targetIndex], swappedPictures[sourceIndex]];
  return {
    pictures: swappedPictures,
    swapped: true,
  };
}

function sameSceneTileSlot(left, right) {
  return left?.column === right?.column && left?.queueIndex === right?.queueIndex;
}

export function isTopStoredSceneTile(layout, slot) {
  const gridSize = Number(layout?.boardSize?.width);
  const column = Number(slot?.column);
  const queueIndex = Number(slot?.queueIndex);
  const tiles = Number.isInteger(column) && Array.isArray(layout?.queues?.[column]?.tiles)
    ? layout.queues[column].tiles
    : null;
  return Number.isInteger(gridSize) && gridSize > 0 && tiles != null &&
    Number.isInteger(queueIndex) && queueIndex >= gridSize && queueIndex === tiles.length - 1;
}

export function selectOrSwapSceneTile(state, layout, slot) {
  const queues = Array.isArray(layout?.queues) ? layout.queues : [];
  const column = Number(slot?.column);
  const queueIndex = Number(slot?.queueIndex);
  const tiles = Number.isInteger(column) && Array.isArray(queues[column]?.tiles) ? queues[column].tiles : null;
  if (tiles == null || !Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= tiles.length) {
    return { state, layout, swapped: false };
  }
  const currentSlot = { column, queueIndex };
  if (state.selectedSceneTileSlot == null) {
    return { state: { ...state, selectedSceneTileSlot: currentSlot }, layout, swapped: false };
  }
  if (sameSceneTileSlot(state.selectedSceneTileSlot, currentSlot)) {
    return { state: { ...state, selectedSceneTileSlot: null }, layout, swapped: false };
  }
  const selected = state.selectedSceneTileSlot;
  const selectedTiles = Array.isArray(queues[selected.column]?.tiles) ? queues[selected.column].tiles : null;
  if (selectedTiles == null || selected.queueIndex < 0 || selected.queueIndex >= selectedTiles.length) {
    return { state: { ...state, selectedSceneTileSlot: currentSlot }, layout, swapped: false };
  }

  const nextLayout = {
    ...layout,
    queues: queues.map((queue) => ({ ...queue, tiles: Array.isArray(queue?.tiles) ? [...queue.tiles] : queue?.tiles })),
  };
  const nextSelectedTiles = nextLayout.queues[selected.column].tiles;
  const nextCurrentTiles = nextLayout.queues[column].tiles;
  [nextSelectedTiles[selected.queueIndex], nextCurrentTiles[queueIndex]] =
    [nextCurrentTiles[queueIndex], nextSelectedTiles[selected.queueIndex]];
  return { state: { ...state, selectedSceneTileSlot: null }, layout: nextLayout, swapped: true };
}

export function swapSceneTilesBySlot(layout, sourceSlot, targetSlot) {
  const queues = Array.isArray(layout?.queues) ? layout.queues : [];
  const sourceColumn = Number(sourceSlot?.column);
  const sourceQueueIndex = Number(sourceSlot?.queueIndex);
  const targetColumn = Number(targetSlot?.column);
  const targetQueueIndex = Number(targetSlot?.queueIndex);
  const sourceTiles = Number.isInteger(sourceColumn) && Array.isArray(queues[sourceColumn]?.tiles)
    ? queues[sourceColumn].tiles
    : null;
  const targetTiles = Number.isInteger(targetColumn) && Array.isArray(queues[targetColumn]?.tiles)
    ? queues[targetColumn].tiles
    : null;
  if (sourceTiles == null || targetTiles == null || !Number.isInteger(sourceQueueIndex) || !Number.isInteger(targetQueueIndex) ||
      sourceQueueIndex < 0 || sourceQueueIndex >= sourceTiles.length || targetQueueIndex < 0 || targetQueueIndex >= targetTiles.length ||
      (sourceColumn === targetColumn && sourceQueueIndex === targetQueueIndex)) {
    return { layout, swapped: false };
  }
  const nextLayout = {
    ...layout,
    queues: queues.map((queue) => ({ ...queue, tiles: Array.isArray(queue?.tiles) ? [...queue.tiles] : queue?.tiles })),
  };
  [nextLayout.queues[sourceColumn].tiles[sourceQueueIndex], nextLayout.queues[targetColumn].tiles[targetQueueIndex]] =
    [nextLayout.queues[targetColumn].tiles[targetQueueIndex], nextLayout.queues[sourceColumn].tiles[sourceQueueIndex]];
  return { layout: nextLayout, swapped: true };
}

export function moveSceneTileToColumn(layout, sourceSlot, targetColumn) {
  const queues = Array.isArray(layout?.queues) ? layout.queues : [];
  const sourceColumn = Number(sourceSlot?.column);
  const sourceQueueIndex = Number(sourceSlot?.queueIndex);
  const destinationColumn = Number(targetColumn);
  const sourceTiles = Number.isInteger(sourceColumn) && Array.isArray(queues[sourceColumn]?.tiles)
    ? queues[sourceColumn].tiles
    : null;
  const destinationTiles = Number.isInteger(destinationColumn) && Array.isArray(queues[destinationColumn]?.tiles)
    ? queues[destinationColumn].tiles
    : null;
  if (sourceTiles == null || destinationTiles == null || !Number.isInteger(sourceQueueIndex) ||
      sourceQueueIndex < 0 || sourceQueueIndex >= sourceTiles.length) {
    return { layout, moved: false };
  }
  const nextLayout = {
    ...layout,
    queues: queues.map((queue) => ({ ...queue, tiles: Array.isArray(queue?.tiles) ? [...queue.tiles] : queue?.tiles })),
  };
  const [tile] = nextLayout.queues[sourceColumn].tiles.splice(sourceQueueIndex, 1);
  nextLayout.queues[destinationColumn].tiles.push(tile);
  return { layout: nextLayout, moved: true };
}

export function moveSelectedTopStoredSceneTile(state, layout, destinationColumn) {
  const selected = state?.selectedSceneTileSlot;
  const destination = Number(destinationColumn);
  const queues = Array.isArray(layout?.queues) ? layout.queues : [];
  if (!isTopStoredSceneTile(layout, selected) || !Number.isInteger(destination) ||
      destination < 0 || destination >= queues.length || destination === selected.column) {
    return { state, layout, moved: false };
  }

  const nextLayout = {
    ...layout,
    queues: queues.map((queue) => ({ ...queue, tiles: Array.isArray(queue?.tiles) ? [...queue.tiles] : queue?.tiles })),
  };
  const sourceTiles = nextLayout.queues[selected.column].tiles;
  const destinationTiles = nextLayout.queues[destination].tiles;
  const [tile] = sourceTiles.splice(selected.queueIndex, 1);
  destinationTiles.push(tile);
  return { state: { ...state, selectedSceneTileSlot: null }, layout: nextLayout, moved: true };
}

export function createLevelPreview(layout) {
  const gridSize = Number(layout?.boardSize?.width) || 0;
  const matchSize = Number(layout?.matchSize?.width) || 0;
  const pictures = Array.isArray(layout?.pictures) ? layout.pictures : [];
  const queues = Array.isArray(layout?.queues) ? layout.queues : [];
  const boardTiles = Array(gridSize * gridSize).fill(null);
  const boardTileSlots = Array(gridSize * gridSize).fill(null);
  const queueTiles = Array.from({ length: gridSize }, () => []);
  const queueTileSlots = Array.from({ length: gridSize }, () => []);
  let totalTileCount = 0;

  for (let column = 0; column < gridSize; column += 1) {
    const tiles = Array.isArray(queues[column]?.tiles) ? queues[column].tiles : [];
    totalTileCount += tiles.length;
    const visibleCount = Math.min(gridSize, tiles.length);
    for (let queueIndex = 0; queueIndex < visibleCount; queueIndex += 1) {
      const row = gridSize - 1 - queueIndex;
      boardTiles[row * gridSize + column] = tiles[queueIndex];
      boardTileSlots[row * gridSize + column] = { column, queueIndex };
    }
    queueTiles[column] = tiles.slice(visibleCount);
    queueTileSlots[column] = queueTiles[column].map((_, queueIndex) => ({
      column,
      queueIndex: queueIndex + visibleCount,
    })).reverse();
  }

  return {
    gridSize,
    matchSize,
    pictures,
    boardTiles,
    boardTileSlots,
    queueTiles,
    // 候场区在棋盘上方：数组从上到下排列，因此下一张掉落切片位于末尾、紧贴棋盘。
    queueStackTiles: queueTiles.map((tiles) => [...tiles].reverse()),
    queueTileSlots,
    pictureCount: pictures.length,
    totalTileCount,
  };
}

export function reduceEditorState(state, action) {
  switch (action.type) {
    case 'toggle-sidebar':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'select-inspector-section':
      return { ...state, activeInspectorSection: action.section };
    case 'set-asset-library':
      return ['project', 'current'].includes(action.library)
        ? { ...state, activeAssetLibrary: action.library }
        : state;
    case 'select-inspector-workspace':
      return ['board', 'project', 'current', 'import'].includes(action.workspace)
        ? { ...state, activeInspectorWorkspace: action.workspace }
        : state;
    case 'set-preview-hud-visible':
      return { ...state, previewHudVisible: action.visible };
    case 'set-preview-running':
      return { ...state, previewRunning: action.running };
    default:
      return state;
  }
}

export function getWorkspaceViewModel(state) {
  return {
    appClassName: state.sidebarCollapsed ? 'editor-app sidebar-collapsed' : 'editor-app',
    sidebarToggleLabel: state.sidebarCollapsed ? '› 展开工具栏' : '‹ 收起工具栏',
    previewStatus: state.previewRunning ? '运行中' : '已就绪',
    previewHudLabel: state.previewHudVisible ? 'HUD 显示' : 'HUD 已隐藏',
  };
}
