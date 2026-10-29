import {
  addPictureToLayout,
  addPictureToLevelLibrary,
  addImportedBackgrounds,
  addImportedPictures,
  calculateExternalQueueLayout,
  calculateSceneLayout,
  changeBoardFormat,
  createEmptyCustomLevel,
  createDraftPayload,
  createEditorState,
  createLevelPreview,
  createSceneViewport,
  getGameBackgroundImagePath,
  getGameBackgroundFit,
  getGameBackgroundMediaType,
  getGameBackgroundScale,
  getGameBackgroundWidth,
  getGameBackgroundHeight,
  getProjectPictureLibrary,
  getSceneViewportPoint,
  getUsableDraft,
  getWorkspaceViewModel,
  isEditorUiToggleKey,
  isScenePanPointerButton,
  isTopStoredSceneTile,
  panSceneViewport,
  reduceEditorState,
  replacePictureInLayout,
  removePictureFromLayout,
  removeImportedBackground,
  removeImportedPicture,
  moveSelectedTopStoredSceneTile,
  moveSceneTileToColumn,
  swapSceneTilesBySlot,
  swapPicturesByIndex,
  zoomSceneViewportAtPoint,
} from './editor-state.mjs';
import { createDualSeamscapePreviewBridge } from './seamscape-preview.mjs';
import { getOfficialLevel, getOfficialPictures, officialLevelCount } from './seamscape-level-index.mjs';

const firstOfficialLevelId = 1;
const lastOfficialLevelId = officialLevelCount;
const officialPictures = getOfficialPictures();
const projectPicturePageSize = 60;

const root = document.querySelector('#editor-root');
const workspace = document.querySelector('.workspace');
const levelGrid = document.querySelector('#level-grid');
const renameLevelButton = document.querySelector('#rename-level-button');
const sidebarToggle = document.querySelector('#sidebar-toggle');
const seamscapePreviewToggle = document.querySelector('#seamscape-preview-toggle');
const seamscapePreviewFrame = document.querySelector('#seamscape-preview-frame');
const seamscapePreviewStatus = document.querySelector('#seamscape-preview-status');
const seamscapeDemoOpen = document.querySelector('#seamscape-demo-open');
const seamscapeDemoStatus = document.querySelector('#seamscape-demo-status');
const hudToggle = document.querySelector('#hud-toggle');
const sceneHud = document.querySelector('.scene-hud');
const runtimeHud = document.querySelector('#runtime-hud');
const sceneLevelLabel = document.querySelector('#scene-level-label');
const runtimeLevelLabel = document.querySelector('#runtime-level-label');
const puzzleBoard = document.querySelector('#puzzle-board');
const runtimeBoard = document.querySelector('#runtime-board');
const runtimeQueueColumns = document.querySelector('#runtime-queue-columns');
const sceneCanvas = document.querySelector('#scene-canvas');
const sceneComposition = document.querySelector('#scene-composition');
const zoomControl = document.querySelector('#zoom-control');
const runtimeComposition = document.querySelector('#runtime-composition');
const phoneComposition = document.querySelector('#phone-composition');
const runtimePhone = document.querySelector('#runtime-phone');
const sceneBackgroundVideo = document.querySelector('#scene-background-video');
const runtimeBackgroundVideo = document.querySelector('#runtime-background-video');
const sceneBackgroundImage = document.querySelector('#scene-background-image');
const runtimeBackgroundImage = document.querySelector('#runtime-background-image');
const pictureLibrary = document.querySelector('#picture-library');
const pictureLibraryTitle = document.querySelector('#picture-library-title');
const projectPictureSource = document.querySelector('#project-picture-source');
const projectPictureSearch = document.querySelector('#project-picture-search');
const projectPicturePrevious = document.querySelector('#project-picture-previous');
const projectPictureNext = document.querySelector('#project-picture-next');
const projectPicturePage = document.querySelector('#project-picture-page');
const currentPictureLibrary = document.querySelector('#current-picture-library');
const importedPictureLibrary = document.querySelector('#imported-picture-library');
const importPictureLibraryTitle = document.querySelector('#import-picture-library-title');
const importPicturesButton = document.querySelector('#import-pictures-button');
const pictureImportInput = document.querySelector('#picture-import-input');
const gameBackgroundLibrary = document.querySelector('#game-background-library');
const adjustBackgroundButton = document.querySelector('#adjust-background-button');
const backgroundSettingsPanel = document.querySelector('#background-settings-panel');
const backgroundFitSelect = document.querySelector('#background-fit-select');
const backgroundScaleInput = document.querySelector('#background-scale-input');
const backgroundScaleValue = document.querySelector('#background-scale-value');
const backgroundWidthInput = document.querySelector('#background-width-input');
const backgroundHeightInput = document.querySelector('#background-height-input');
const importBackgroundsButton = document.querySelector('#import-backgrounds-button');
const backgroundImportInput = document.querySelector('#background-import-input');
const canvasTip = document.querySelector('#canvas-tip');
const inspectorTitle = document.querySelector('#inspector-title');
const inspectorResource = document.querySelector('#inspector-resource');
const inspectorGrid = document.querySelector('#inspector-grid');
const inspectorPlacement = document.querySelector('#inspector-placement');
const validationSummary = document.querySelector('#validation-summary');
const assetButtons = [...document.querySelectorAll('[data-inspector-workspace]')];
const inspectorWorkspaces = [...document.querySelectorAll('[data-workspace]')];
const addPictureToLevelButton = document.querySelector('#add-picture-to-level-button');
const deleteCurrentPictureButton = document.querySelector('#delete-current-picture-button');
const boardFormatSelect = document.querySelector('#board-format-select');
const applyBoardFormatButton = document.querySelector('#apply-board-format-button');
const boardFormatHelp = document.querySelector('#board-format-help');
const autoSaveStatus = document.querySelector('#auto-save-status');
const exportLevelButton = document.querySelector('#export-level-button');
const newLevelButton = document.querySelector('#new-level-button');
const deleteLevelButton = document.querySelector('#delete-level-button');
const dragPreview = document.querySelector('#drag-preview');

let state = createEditorState(firstOfficialLevelId);
let activeLayout;
let activePreview;
let sceneViewport = createSceneViewport();
let panningPointer;
let selectedProjectPicture = null;
let importedPictures = [];
let pendingSquarePictures = [];
let squareTwoPictures = [];
let projectCatalogsReady = Promise.resolve();
let projectPicturePageIndex = 0;
let projectPictureFingerprintsPromise;
let importedGameBackgrounds = [];
let selectedGameBackground = null;
let activeLevel = null;
let seamscapePreviewBridge = null;
let seamscapePreviewRunning = false;
let seamscapePreviewKey = null;
let draftWriteQueue = Promise.resolve();
let levelLoadSequence = 0;
let draggedCurrentPictureIndex = null;
let dragTargetCurrentPictureIndex = null;
let currentPicturePointerId = null;
let isCurrentPicturePointerDragging = false;
let suppressCurrentPictureClick = false;
let draggedSceneTileSlot = null;
let dragTargetSceneTile = null;
let sceneTilePointerId = null;
let isSceneTilePointerDragging = false;
let suppressSceneTileClick = false;
let customLevels = [];
let levelNames = {};
let importedPicturesReady = Promise.resolve();
let renderedProjectPictureSelection;

function getAllProjectPictures() {
  return [...officialPictures, ...pendingSquarePictures, ...squareTwoPictures];
}

function renderSceneViewport() {
  sceneComposition.style.setProperty('--viewport-x', `${sceneViewport.x}px`);
  sceneComposition.style.setProperty('--viewport-y', `${sceneViewport.y}px`);
  sceneComposition.style.setProperty('--viewport-zoom', String(sceneViewport.zoom));
  zoomControl.textContent = `缩放 ${Math.round(sceneViewport.zoom * 100)}%`;
}

function renderShell() {
  const viewModel = getWorkspaceViewModel(state);
  root.className = viewModel.appClassName;
  sidebarToggle.textContent = viewModel.sidebarToggleLabel;
  hudToggle.textContent = viewModel.previewHudLabel;
  seamscapePreviewToggle.textContent = seamscapePreviewRunning ? '■ 停止' : '▶ 游玩';
  seamscapeDemoOpen.disabled = !seamscapePreviewRunning;
  sceneHud.hidden = !state.previewHudVisible;
  runtimeHud.hidden = !state.previewHudVisible;
  addPictureToLevelButton.disabled = selectedProjectPicture == null || activeLayout == null;
  newLevelButton.disabled = activeLevel == null;
  renameLevelButton.disabled = activeLevel == null || renameLevelButton.dataset.busy === 'true';
  deleteLevelButton.disabled = activeLevel == null || !customLevels.some((level) => level.id === activeLevel.id);
  exportLevelButton.disabled = activeLevel == null || activeLayout == null || exportLevelButton.dataset.busy === 'true';
  adjustBackgroundButton.disabled = selectedGameBackground == null;
  addPictureToLevelButton.title = selectedProjectPicture == null
    ? '请先从项目总图片或导入图片中选择素材'
    : `将 ${getPictureName(selectedProjectPicture)} 添加到本关`;
  deleteCurrentPictureButton.disabled = state.selectedPictureIndex == null || selectedProjectPicture != null ||
    !Array.isArray(activeLayout?.pictures) || activeLayout.pictures.length <= 1;
  assetButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.inspectorWorkspace === state.activeInspectorWorkspace));
  inspectorWorkspaces.forEach((workspace) => {
    workspace.hidden = workspace.dataset.workspace !== state.activeInspectorWorkspace;
  });
  renderBoardFormatControls();
  renderAutoSaveStatus();
  syncSeamscapePreview();
}

function syncSeamscapePreview() {
  if (!seamscapePreviewRunning || activeLevel == null || activeLayout == null) return;
  const backgroundType = getGameBackgroundMediaType(selectedGameBackground);
  const backgroundPath = getGameBackgroundImagePath(selectedGameBackground);
  const backgroundFit = getGameBackgroundFit(selectedGameBackground);
  const backgroundScale = getGameBackgroundScale(selectedGameBackground);
  const backgroundWidth = getGameBackgroundWidth(selectedGameBackground);
  const backgroundHeight = getGameBackgroundHeight(selectedGameBackground);
  const key = JSON.stringify([activeLevel.id, activeLayout.boardSize, activeLayout.matchSize,
    activeLayout.pictures, activeLayout.queues, state.selectedPictureIndex, backgroundPath, backgroundType,
    backgroundFit, backgroundScale, backgroundWidth, backgroundHeight]);
  if (key === seamscapePreviewKey) return;
  try {
    seamscapePreviewBridge.publish({ ...activeLevel, variants: [{ ...activeLevel.variants[0], layout: activeLayout }] },
      state.selectedPictureIndex ?? 0, backgroundPath, backgroundType, backgroundFit, backgroundScale,
      backgroundWidth, backgroundHeight);
    seamscapePreviewKey = key;
  } catch (error) {
    seamscapePreviewBridge.clear();
    seamscapePreviewStatus.textContent = `无法同步：${error.message}`;
  }
}

function updateSeamscapePreviewFrameScale() {
  const stage = seamscapePreviewFrame.parentElement;
  const scale = Math.min(stage.clientWidth / 750, stage.clientHeight / 1600);
  if (scale > 0) seamscapePreviewFrame.style.setProperty('--seamscape-preview-scale', String(scale));
}

async function toggleSeamscapePreview() {
  if (seamscapePreviewRunning) {
    seamscapePreviewRunning = false;
    seamscapePreviewBridge.stopControl();
    seamscapePreviewFrame.hidden = true;
    seamscapePreviewFrame.src = 'about:blank';
    seamscapePreviewStatus.textContent = '本地关卡游玩';
    renderShell();
    return;
  }
  seamscapePreviewToggle.disabled = true;
  try {
    const response = await fetch('./seamscape/?editorPreview=1');
    if (!response.ok) throw new Error(response.status === 503 ? 'Seamscape WebGL 尚未构建' : '无法加载 Seamscape WebGL');
    if (seamscapePreviewBridge == null) {
      seamscapePreviewBridge = createDualSeamscapePreviewBridge({
        controlIframe: seamscapePreviewFrame,
        onControlStatus: (status) => { seamscapePreviewStatus.textContent = status; },
        onDemoStatus: (status) => { seamscapeDemoStatus.textContent = status; },
        onLevelRequest: playRequestedLocalLevel,
      });
    }
    seamscapePreviewRunning = true;
    seamscapePreviewKey = null;
    seamscapePreviewBridge.startControl();
    seamscapePreviewBridge.setHudVisible(state.previewHudVisible);
    updateSeamscapePreviewFrameScale();
    seamscapePreviewFrame.src = seamscapePreviewBridge.controlUrl;
    seamscapePreviewFrame.hidden = false;
    renderShell();
  } catch (error) {
    seamscapePreviewStatus.textContent = error.message;
  } finally {
    seamscapePreviewToggle.disabled = false;
  }
}

async function playRequestedLocalLevel(levelId) {
  if (!seamscapePreviewRunning) return;
  if (levelId === state.levelId) {
    seamscapePreviewKey = null;
    syncSeamscapePreview();
    return;
  }
  if (levelId > lastOfficialLevelId && !customLevels.some((level) => level.id === levelId)) {
    seamscapePreviewStatus.textContent = `本地关卡 ${formatLevel(levelId)} 不存在`;
    return;
  }
  seamscapePreviewStatus.textContent = `正在打开本地关卡 ${formatLevel(levelId)}…`;
  await loadSelectedLevel(levelId, { deferUntilDraft: true });
}

function renderAutoSaveStatus(label = '修改后自动保存') {
  autoSaveStatus.textContent = label;
  autoSaveStatus.setAttribute('aria-label', label);
}

function renderBoardFormatControls(currentBoardSize = Number(activePreview?.gridSize) || 4, { resetSelection = false } = {}) {
  if (resetSelection || !['3', '4', '5', '6', '7'].includes(boardFormatSelect.value)) {
    boardFormatSelect.value = String(currentBoardSize);
  }
  if (resetSelection) {
    boardFormatHelp.textContent = '切换格式会重新配置棋盘。';
  }
  applyBoardFormatButton.disabled = activeLayout == null || Number(boardFormatSelect.value) === currentBoardSize;
}

function buttonName(section) {
  return { background: '场景背景', board: '棋盘', queue: '队列' }[section] ?? '拼图图片';
}

function formatLevel(levelId) {
  return String(levelId).padStart(4, '0');
}

function getPicturePath(layout, tile) {
  return layout.pictures[state.selectedPictureIndex ?? tile.pictureIndex]?.imagePath ?? '';
}

function getPictureUrl(imagePath) {
  return /^(?:data:|blob:|https?:)/.test(imagePath) ? imagePath : `./resources/${imagePath}`;
}

function getPictureName(picture) {
  if (typeof picture?.name === 'string' && picture.name.length > 0) return picture.name;
  const imagePath = picture?.imagePath ?? '';
  return imagePath.startsWith('data:') ? '导入图片' : imagePath.split('/').at(-1);
}

function sameSceneTileSlot(left, right) {
  return left?.column === right?.column && left?.queueIndex === right?.queueIndex;
}

function createTileElement(layout, preview, tile, className = 'preview-tile', sceneSlot = null) {
  const element = document.createElement(sceneSlot == null ? 'div' : 'button');
  if (sceneSlot != null) element.type = 'button';
  element.className = className;
  if (tile == null) {
    element.classList.add('is-empty');
    element.setAttribute('aria-label', '空拼图格');
    if (className === 'preview-tile') {
      element.classList.add('scene-empty-drop-target');
    }
    return element;
  }

  const imagePath = getPicturePath(layout, tile);
  const matchSize = Math.max(1, preview.matchSize);
  const row = Math.floor(tile.tileIndex / matchSize);
  const column = tile.tileIndex % matchSize;
  const positionX = matchSize === 1 ? 0 : column * 100 / (matchSize - 1);
  const positionY = matchSize === 1 ? 0 : row * 100 / (matchSize - 1);
  element.style.backgroundImage = `url("${getPictureUrl(imagePath)}")`;
  element.style.backgroundSize = `${matchSize * 100}% ${matchSize * 100}%`;
  element.style.backgroundPosition = `${positionX}% ${positionY}%`;
  element.dataset.pictureIndex = String(tile.pictureIndex);
  element.dataset.tileIndex = String(tile.tileIndex);
  element.title = `图片 ${String(tile.pictureIndex + 1).padStart(2, '0')}，切片 ${tile.tileIndex}`;
  element.setAttribute('aria-label', element.title);
  if (sceneSlot != null) {
    const selected = sameSceneTileSlot(state.selectedSceneTileSlot, sceneSlot);
    const isDragSource = sameSceneTileSlot(draggedSceneTileSlot, sceneSlot);
    const isDragTarget = dragTargetSceneTile?.kind === 'tile' && sameSceneTileSlot(dragTargetSceneTile.slot, sceneSlot);
    element.classList.add('scene-tile');
    element.classList.toggle('is-preselected', selected);
    element.classList.toggle('is-drag-source', isDragSource);
    element.classList.toggle('is-drag-target', isDragTarget);
    element.setAttribute('aria-pressed', String(selected));
    element.title = selected
      ? `${element.title}；已选中，可拖动到另一切片交换位置`
      : `${element.title}；拖动到另一切片交换位置`;
    element.dataset.sceneColumn = String(sceneSlot.column);
    element.dataset.sceneQueueIndex = String(sceneSlot.queueIndex);
    element.addEventListener('click', () => {
      if (suppressSceneTileClick) suppressSceneTileClick = false;
      else selectSceneTile(sceneSlot);
    });
    element.addEventListener('pointerdown', (event) => beginSceneTilePointerDrag(event, sceneSlot, tile));
  }
  return element;
}

function configureGrid(element, preview, layout) {
  const tileWidth = Math.max(1, Number(layout.tilePixelSize?.width) || 1);
  const tileHeight = Math.max(1, Number(layout.tilePixelSize?.height) || 1);
  element.style.setProperty('--grid-size', String(preview.gridSize));
  element.style.setProperty('--tile-aspect', `${tileWidth} / ${tileHeight}`);
  element.style.setProperty('--queue-tile-overlap', `${-(tileHeight / tileWidth - 1 / 6) * 100}%`);
}

function applySceneCompositionLayout(phone, queueElement, composition, preview, layout, mode) {
  const isRuntime = mode === 'runtime';
  const queueLengths = preview.queueStackTiles.map((queue) => queue.length);
  const externalQueueHeight = isRuntime ? 250 : 315;
  const sceneLayout = calculateSceneLayout({
    gridSize: preview.gridSize,
    tilePixelSize: layout.tilePixelSize,
    containerWidth: isRuntime ? 166 : 196,
    containerHeight: externalQueueHeight,
    mode,
  });
  if (!isRuntime) {
    phone.style.setProperty('--scene-board-width', `${sceneLayout.boardWidth}px`);
    phone.style.setProperty('--scene-board-height', `${sceneLayout.boardHeight}px`);
    phone.style.setProperty('--scene-tile-width', `${sceneLayout.tileWidth}px`);
    phone.style.setProperty('--scene-tile-height', `${sceneLayout.tileHeight}px`);
    composition.style.setProperty('--scene-composition-width', '210px');
    composition.style.setProperty('--scene-composition-height', '448px');
    return;
  }
  const externalQueueLayout = calculateExternalQueueLayout({
    gridSize: preview.gridSize,
    tilePixelSize: layout.tilePixelSize,
    queueLengths,
    boardWidth: sceneLayout.boardWidth,
    queueHeight: externalQueueHeight,
    mode,
  });

  phone.style.setProperty('--scene-board-width', `${sceneLayout.boardWidth}px`);
  phone.style.setProperty('--scene-board-height', `${sceneLayout.boardHeight}px`);
  phone.style.setProperty('--scene-tile-width', `${sceneLayout.tileWidth}px`);
  phone.style.setProperty('--scene-tile-height', `${sceneLayout.tileHeight}px`);
  queueElement.style.setProperty('--scene-board-width', `${externalQueueLayout.boardWidth}px`);
  queueElement.style.setProperty('--external-queue-width', `${externalQueueLayout.boardWidth}px`);
  queueElement.style.setProperty('--external-queue-height', `${externalQueueLayout.queueHeight}px`);
  queueElement.style.setProperty('--external-tile-height', `${externalQueueLayout.tileHeight}px`);
  queueElement.style.setProperty('--external-queue-step', `${externalQueueLayout.queueTileStep}px`);
  composition.style.setProperty('--scene-composition-width', `${sceneLayout.boardWidth}px`);
  composition.style.setProperty('--scene-composition-height', `${externalQueueLayout.compositionHeight}px`);
}

function renderQueueColumns(element, layout, preview, sceneEditable = false) {
  configureGrid(element, preview, layout);
  const queueElements = preview.queueStackTiles.map((queue, column) => {
    const columnElement = document.createElement('div');
    columnElement.className = 'queue-column';
    columnElement.setAttribute('aria-label', `第 ${column + 1} 列后续掉落队列`);
    const label = document.createElement('span');
    label.className = 'queue-label';
    label.textContent = `列 ${column + 1}`;
    const dropTarget = document.createElement('button');
    dropTarget.type = 'button';
    dropTarget.className = 'queue-top-drop-target';
    const canMoveSelectedTop = sceneEditable && isTopStoredSceneTile(layout, state.selectedSceneTileSlot);
    const canDropDraggedTile = sceneEditable && draggedSceneTileSlot != null;
    dropTarget.hidden = !sceneEditable;
    dropTarget.disabled = !canDropDraggedTile && (!canMoveSelectedTop || state.selectedSceneTileSlot?.column === column);
    dropTarget.dataset.sceneEmptyColumn = String(column);
    dropTarget.classList.toggle('is-drag-target',
      (dragTargetSceneTile?.kind === 'insert' && dragTargetSceneTile.column === column &&
        dragTargetSceneTile.index === (activeLayout?.queues?.[column]?.tiles?.length ?? 0)));
    dropTarget.setAttribute('aria-label', `第 ${column + 1} 列空白落点，可拖入切片`);
    dropTarget.addEventListener('click', (event) => {
      event.stopPropagation();
      moveSelectedTopTileToColumn(column);
    });
    const tiles = document.createElement('div');
    tiles.className = 'queue-tile-stack';
    tiles.replaceChildren(dropTarget, ...queue.map((tile, index) => createTileElement(
      layout,
      preview,
      tile,
      'queue-tile',
      sceneEditable ? preview.queueTileSlots[column][index] : null,
    )));
    columnElement.append(label, tiles);
    return columnElement;
  });
  element.replaceChildren(...queueElements);
}

function moveSelectedTopTileToColumn(column) {
  if (activeLayout == null || activePreview == null) return;
  const result = moveSelectedTopStoredSceneTile(state, activeLayout, column);
  if (!result.moved) return;
  state = result.state;
  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = `已将顶部切片移动到第 ${column + 1} 列顶部。`;
  saveLevelChanges(activeLevel.id, activeLayout);
}

function renderPreview(layout, preview) {
  const levelLabel = `LEVEL ${formatLevel(state.levelId)}`;
  sceneLevelLabel.textContent = levelLabel;
  runtimeLevelLabel.textContent = levelLabel;
  applySceneCompositionLayout(phoneComposition, null, sceneComposition, preview, layout, 'editor');
  applySceneCompositionLayout(runtimePhone, runtimeQueueColumns, runtimeComposition, preview, layout, 'runtime');
  configureGrid(puzzleBoard, preview, layout);
  configureGrid(runtimeBoard, preview, layout);
  puzzleBoard.replaceChildren(...preview.boardTiles.map((tile, index) => createTileElement(
    layout,
    preview,
    tile,
    'preview-tile',
    tile == null ? null : preview.boardTileSlots[index],
  )));
  const emptyColumns = preview.boardTiles
    .map((tile, index) => (tile == null ? index % preview.gridSize : null))
    .filter((column) => column != null);
  puzzleBoard.querySelectorAll('.scene-empty-drop-target').forEach((element, index) => {
    const column = emptyColumns[index];
    element.dataset.sceneEmptyColumn = String(column);
    element.setAttribute('aria-label', `第 ${column + 1} 列空拼图格，可拖入切片`);
  });
  runtimeBoard.replaceChildren(...preview.boardTiles.map((tile) => createTileElement(layout, preview, tile, 'runtime-tile')));

  renderQueueColumns(runtimeQueueColumns, layout, preview);
}

function selectSceneTile(slot) {
  if (activeLayout == null || activePreview == null) return;
  if (selectedProjectPicture != null) {
    canvasTip.textContent = '请在右侧“本关图片库”中点击需要替换的图片。';
    return;
  }
  const selectedSceneTileSlot = sameSceneTileSlot(state.selectedSceneTileSlot, slot) ? null : slot;
  state = { ...state, selectedSceneTileSlot };
  updateSceneTileDragClasses();
  renderShell();
  if (selectedSceneTileSlot == null) {
    canvasTip.textContent = '已取消切片预选。';
  } else {
    canvasTip.textContent = '切片已选中；拖动到另一切片可交换位置，或使用“放到顶部”。';
  }
}

function beginSceneTilePointerDrag(event, slot, tile) {
  if (selectedProjectPicture != null) return;
  draggedSceneTileSlot = slot;
  dragTargetSceneTile = null;
  sceneTilePointerId = event.pointerId;
  isSceneTilePointerDragging = false;
  state = { ...state, selectedSceneTileSlot: slot };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  showDragPreview(event, tile, true);
  updateSceneTileDragClasses();
  renderShell();
}

function updateSceneTilePointerDrag(event) {
  if (event.pointerId !== sceneTilePointerId || draggedSceneTileSlot == null) return;
  moveDragPreview(event);
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-scene-column][data-scene-queue-index], [data-scene-empty-column]');
  const targetSlot = target?.hasAttribute('data-scene-column') ? {
    column: Number(target.dataset.sceneColumn), queueIndex: Number(target.dataset.sceneQueueIndex),
  } : null;
  const emptyColumn = target?.hasAttribute('data-scene-empty-column') ? Number(target.dataset.sceneEmptyColumn) : null;
  const nextTarget = Number.isInteger(targetSlot?.column) && Number.isInteger(targetSlot?.queueIndex) &&
    !sameSceneTileSlot(targetSlot, draggedSceneTileSlot)
      ? { kind: 'tile', slot: targetSlot }
    : Number.isInteger(emptyColumn)
      ? { kind: 'column', column: emptyColumn }
      : null;
  const targetsMatch = nextTarget?.kind === dragTargetSceneTile?.kind &&
    (nextTarget?.kind === 'tile'
      ? sameSceneTileSlot(nextTarget.slot, dragTargetSceneTile?.slot)
      : nextTarget?.column === dragTargetSceneTile?.column);
  if (targetsMatch) return;
  isSceneTilePointerDragging = true;
  dragTargetSceneTile = nextTarget;
  updateSceneTileDragClasses();
}

function endSceneTilePointerDrag(event) {
  if (event.pointerId !== sceneTilePointerId || draggedSceneTileSlot == null || activeLayout == null || activePreview == null) return;
  const sourceSlot = draggedSceneTileSlot;
  const target = isSceneTilePointerDragging ? dragTargetSceneTile : null;
  draggedSceneTileSlot = null;
  dragTargetSceneTile = null;
  sceneTilePointerId = null;
  isSceneTilePointerDragging = false;
  suppressSceneTileClick = true;
  hideDragPreview();
  const result = target?.kind === 'tile'
    ? swapSceneTilesBySlot(activeLayout, sourceSlot, target.slot)
    : target?.kind === 'column'
      ? moveSceneTileToColumn(activeLayout, sourceSlot, target.column)
      : { layout: activeLayout, swapped: false, moved: false };
  if (!result.swapped && !result.moved) {
    updateSceneTileDragClasses();
    return;
  }
  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  state = { ...state, selectedSceneTileSlot: null };
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = result.moved
    ? '已将切片移动到目标列顶部。'
    : '已交换两个切片的初始位置；运行预览已同步更新。';
  saveLevelChanges(activeLevel.id, activeLayout);
}

function cancelSceneTilePointerDrag(event) {
  if (event.pointerId !== sceneTilePointerId) return;
  draggedSceneTileSlot = null;
  dragTargetSceneTile = null;
  sceneTilePointerId = null;
  isSceneTilePointerDragging = false;
  suppressSceneTileClick = true;
  hideDragPreview();
  updateSceneTileDragClasses();
}

function updateSceneTileDragClasses() {
  document.querySelectorAll('[data-scene-column][data-scene-queue-index]').forEach((element) => {
    const slot = { column: Number(element.dataset.sceneColumn), queueIndex: Number(element.dataset.sceneQueueIndex) };
    element.classList.toggle('is-preselected', sameSceneTileSlot(state.selectedSceneTileSlot, slot));
    element.classList.toggle('is-drag-source', sameSceneTileSlot(draggedSceneTileSlot, slot));
    element.classList.toggle('is-drag-target', dragTargetSceneTile?.kind === 'tile' && sameSceneTileSlot(dragTargetSceneTile.slot, slot));
  });
  document.querySelectorAll('[data-scene-empty-column]').forEach((element) => {
    element.classList.toggle('is-drag-target',
      dragTargetSceneTile?.kind === 'column' &&
        Number(element.dataset.sceneEmptyColumn) === dragTargetSceneTile.column);
  });
}

function showDragPreview(event, tile, tileOnly = false) {
  if (activeLayout == null || activePreview == null || tile == null) return;
  const imagePath = getPicturePath(activeLayout, tile);
  const matchSize = Math.max(1, activePreview.matchSize);
  const row = Math.floor(tile.tileIndex / matchSize);
  const column = tile.tileIndex % matchSize;
  dragPreview.style.backgroundImage = `url("${getPictureUrl(imagePath)}")`;
  dragPreview.style.backgroundSize = tileOnly ? `${matchSize * 100}% ${matchSize * 100}%` : 'cover';
  dragPreview.style.backgroundPosition = tileOnly
    ? `${matchSize === 1 ? 0 : column * 100 / (matchSize - 1)}% ${matchSize === 1 ? 0 : row * 100 / (matchSize - 1)}%`
    : 'center';
  dragPreview.hidden = false;
  moveDragPreview(event);
}

function moveDragPreview(event) {
  if (!dragPreview.hidden) {
    dragPreview.style.left = `${event.clientX}px`;
    dragPreview.style.top = `${event.clientY}px`;
  }
}

function hideDragPreview() {
  dragPreview.hidden = true;
  dragPreview.style.backgroundImage = '';
}

async function fingerprintArrayBuffer(arrayBuffer) {
  if (globalThis.crypto?.subtle == null) throw new Error('当前浏览器不支持图片内容去重');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createResourceFingerprint(imagePath) {
  return fetch(`./resources/${imagePath}`).then(async (response) => {
    if (!response.ok) throw new Error(`无法读取图片（${response.status}）`);
    return fingerprintArrayBuffer(await response.arrayBuffer());
  });
}

async function getProjectPictureFingerprints() {
  if (projectPictureFingerprintsPromise == null) {
    projectPictureFingerprintsPromise = Promise.resolve(officialPictures)
      .then(async (pictures) => {
        await projectCatalogsReady;
        const fingerprints = [];
        for (let offset = 0; offset < pictures.length; offset += 16) {
          const batch = pictures.slice(offset, offset + 16);
          fingerprints.push(...await Promise.all(batch.map(async (picture) => {
            try {
              return await createResourceFingerprint(picture.imagePath);
            } catch {
              return null;
            }
          })));
        }
        return [
          ...fingerprints.filter(Boolean),
          ...pendingSquarePictures.map((picture) => picture.fingerprint),
          ...squareTwoPictures.map((picture) => picture.fingerprint),
        ].filter(Boolean);
      });
  }
  return projectPictureFingerprintsPromise;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error ?? new Error(`无法读取 ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

async function createImportedPicture(file) {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) throw new Error(`${file.name} 不是支持的图片或视频文件`);
  const [imagePath, fingerprint] = await Promise.all([
    fileAsDataUrl(file),
    file.arrayBuffer().then(fingerprintArrayBuffer),
  ]);
  return { imagePath, fingerprint, name: file.name, mimeType: file.type, mediaType: file.type.startsWith('video/') ? 'video' : 'image', imported: true };
}

async function saveImportedPicture(picture, kind) {
  const response = await fetch('./api/imported-assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      fingerprint: picture.fingerprint,
      name: picture.name,
      mimeType: picture.mimeType,
      dataUrl: picture.imagePath,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? '图片保存失败');
  return payload.picture;
}

async function loadSavedPictures(kind) {
  const response = await fetch(`./api/imported-assets?kind=${encodeURIComponent(kind)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? '无法读取已保存图片');
  return Array.isArray(payload.pictures) ? payload.pictures : [];
}

async function deleteSavedPicture(kind, picture) {
  const response = await fetch(`./api/imported-assets?kind=${encodeURIComponent(kind)}&fingerprint=${encodeURIComponent(picture.fingerprint)}`, {
    method: 'DELETE',
  });
  if (response.status === 404) return;
  const payload = await response.json();
  if (!response.ok || !payload.removed) throw new Error(payload.error ?? '图片删除失败');
}

async function restoreImportedPictures() {
  try {
    const [savedPictures, savedBackgrounds] = await Promise.all([
      loadSavedPictures('puzzle'),
      loadSavedPictures('background'),
    ]);
    importedPictures = savedPictures;
    importedGameBackgrounds = savedBackgrounds;
    renderGameBackgroundLibrary();
    if (activeLayout != null && activePreview != null) renderPictureLibrary(activeLayout, activePreview);
  } catch (error) {
    canvasTip.textContent = `无法恢复已保存图片：${error.message}`;
  }
}

function getRestorableDraftBackground(background) {
  if (background == null) return null;
  const asset = importedGameBackgrounds.find((candidate) => candidate.imagePath === background.imagePath);
  return asset == null ? null : {
    ...asset,
    fit: background.fit,
    scale: background.scale,
    width: background.width,
    height: background.height,
  };
}

async function importPictures(files) {
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;
  try {
    const [newPictures, projectFingerprints] = await Promise.all([
      Promise.all(selectedFiles.map(createImportedPicture)),
      getProjectPictureFingerprints(),
    ]);
    const result = addImportedPictures(importedPictures, newPictures, projectFingerprints);
    const oldFingerprints = new Set(importedPictures.map((picture) => picture.fingerprint));
    const savedPictures = await Promise.all(
      result.pictures
        .filter((picture) => !oldFingerprints.has(picture.fingerprint))
        .map((picture) => saveImportedPicture(picture, 'puzzle')),
    );
    importedPictures = [...importedPictures, ...savedPictures];
    if (result.added > 0) state = reduceEditorState(state, { type: 'select-inspector-workspace', workspace: 'import' });
    renderPictureLibrary(activeLayout, activePreview);
    renderShell();
    const message = result.added > 0
      ? `已导入 ${result.added} 张拼图图片${result.skipped > 0 ? `，已过滤 ${result.skipped} 张重复图片` : ''}。`
      : '没有导入新图片：所选图片均与项目图片重复。';
    canvasTip.textContent = message;
  } catch (error) {
    canvasTip.textContent = `导入图片失败：${error.message}`;
  } finally {
    pictureImportInput.value = '';
  }
}

async function importGameBackgrounds(files) {
  const selectedFiles = [...files];
  if (selectedFiles.length === 0) return;
  try {
    const newBackgrounds = await Promise.all(selectedFiles.map(createImportedPicture));
    const result = addImportedBackgrounds(importedGameBackgrounds, newBackgrounds);
    const oldFingerprints = new Set(importedGameBackgrounds.map((picture) => picture.fingerprint));
    const savedBackgrounds = await Promise.all(
      result.pictures
        .filter((picture) => !oldFingerprints.has(picture.fingerprint))
        .map((picture) => saveImportedPicture(picture, 'background')),
    );
    importedGameBackgrounds = [...importedGameBackgrounds, ...savedBackgrounds];
    renderGameBackgroundLibrary();
    if (result.added > 0) state = reduceEditorState(state, { type: 'select-inspector-workspace', workspace: 'board' });
    renderShell();
    canvasTip.textContent = result.added > 0
      ? `已导入 ${result.added} 张游戏背景${result.skipped > 0 ? `，已过滤 ${result.skipped} 张重复图片` : ''}。`
      : '没有导入新背景：所选图片均与已导入背景重复。';
  } catch (error) {
    canvasTip.textContent = `导入游戏背景失败：${error.message}`;
  } finally {
    backgroundImportInput.value = '';
  }
}

function applyGameBackground() {
  const mediaType = getGameBackgroundMediaType(selectedGameBackground);
  const imagePath = getGameBackgroundImagePath(selectedGameBackground);
  const fit = getGameBackgroundFit(selectedGameBackground);
  const scale = getGameBackgroundScale(selectedGameBackground);
  const width = getGameBackgroundWidth(selectedGameBackground);
  const height = getGameBackgroundHeight(selectedGameBackground);
  for (const image of [sceneBackgroundImage, runtimeBackgroundImage]) {
    image.hidden = mediaType !== 'image' || !imagePath;
    image.src = imagePath && mediaType === 'image' ? getPictureUrl(imagePath) : '';
    image.dataset.fit = fit;
    image.style.setProperty('--background-scale', String(scale));
    image.style.setProperty('--background-width', String(width));
    image.style.setProperty('--background-height', String(height));
  }
  for (const phone of [phoneComposition, runtimePhone]) phone.style.backgroundImage = '';
  for (const video of [sceneBackgroundVideo, runtimeBackgroundVideo]) {
    if (mediaType !== 'video' || !selectedGameBackground?.imagePath) {
      video.pause();
      video.removeAttribute('src');
      video.hidden = true;
      continue;
    }
    video.src = getPictureUrl(selectedGameBackground.imagePath);
    video.dataset.fit = fit;
    video.style.setProperty('--background-scale', String(scale));
    video.style.setProperty('--background-width', String(width));
    video.style.setProperty('--background-height', String(height));
    video.hidden = false;
    video.play().catch(() => {});
  }
}

function updateSelectedBackgroundSettings(settings) {
  if (selectedGameBackground == null) return;
  selectedGameBackground = { ...selectedGameBackground, ...settings };
  applyGameBackground();
  syncSeamscapePreview();
  saveLevelChanges(activeLevel?.id, activeLayout);
}

function renderBackgroundSettingsControls() {
  backgroundSettingsPanel.hidden = selectedGameBackground == null || backgroundSettingsPanel.hidden;
  backgroundFitSelect.value = getGameBackgroundFit(selectedGameBackground);
  backgroundScaleInput.value = String(Math.round(getGameBackgroundScale(selectedGameBackground) * 100));
  backgroundScaleValue.textContent = `${backgroundScaleInput.value}%`;
  backgroundWidthInput.value = String(Math.round(getGameBackgroundWidth(selectedGameBackground) * 100));
  backgroundHeightInput.value = String(Math.round(getGameBackgroundHeight(selectedGameBackground) * 100));
}

function renderGameBackgroundLibrary() {
  renderBackgroundSettingsControls();
  if (importedGameBackgrounds.length === 0) {
    gameBackgroundLibrary.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'picture-library-status',
      textContent: '尚未导入游戏背景。',
    }));
    return;
  }

  const cards = importedGameBackgrounds.map((background) => {
    const isSelected = selectedGameBackground?.imagePath === background.imagePath;
    const card = document.createElement('article');
    card.className = 'picture-card imported-picture-card';
    card.classList.toggle('is-preselected', isSelected);
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'project-picture-select';
    selectButton.setAttribute('aria-pressed', String(isSelected));
    selectButton.title = background.name ?? background.imagePath;
    selectButton.setAttribute('aria-label', `使用 ${getPictureName(background)} 作为游戏背景`);
    if (getGameBackgroundMediaType(background) === 'video') {
      const video = document.createElement('video');
      video.src = getPictureUrl(background.imagePath);
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', getPictureName(background));
      video.addEventListener('loadeddata', () => video.play().catch(() => {}), { once: true });
      selectButton.append(video);
    } else {
      const image = document.createElement('img');
      image.src = getPictureUrl(background.imagePath);
      image.alt = getPictureName(background);
      image.loading = 'lazy';
      selectButton.append(image);
    }
    selectButton.addEventListener('click', () => {
      selectedGameBackground = {
        ...background,
        fit: getGameBackgroundFit(selectedGameBackground?.imagePath === background.imagePath ? selectedGameBackground : background),
        scale: getGameBackgroundScale(selectedGameBackground?.imagePath === background.imagePath ? selectedGameBackground : background),
        width: getGameBackgroundWidth(selectedGameBackground?.imagePath === background.imagePath ? selectedGameBackground : background),
        height: getGameBackgroundHeight(selectedGameBackground?.imagePath === background.imagePath ? selectedGameBackground : background),
      };
      applyGameBackground();
      renderGameBackgroundLibrary();
      syncSeamscapePreview();
      canvasTip.textContent = `已将 ${getPictureName(background)} 应用于场景与预览。`;
      saveLevelChanges(activeLevel?.id, activeLayout);
    });
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-picture-button';
    deleteButton.textContent = '删除';
    deleteButton.setAttribute('aria-label', `删除游戏背景 ${getPictureName(background)}`);
    deleteButton.addEventListener('click', () => deleteGameBackground(background));
    card.append(selectButton, deleteButton);
    return card;
  });
  gameBackgroundLibrary.replaceChildren(...cards);
}

async function deleteGameBackground(background) {
  try {
    await deleteSavedPicture('background', background);
    const result = removeImportedBackground(importedGameBackgrounds, background.imagePath);
    if (!result.removed) return;
    importedGameBackgrounds = result.pictures;
    if (selectedGameBackground?.imagePath === background.imagePath) {
      selectedGameBackground = null;
      applyGameBackground();
      syncSeamscapePreview();
      saveLevelChanges(activeLevel?.id, activeLayout);
    }
    renderGameBackgroundLibrary();
    canvasTip.textContent = `已删除游戏背景 ${getPictureName(background)}。`;
  } catch (error) {
    canvasTip.textContent = `删除游戏背景失败：${error.message}`;
  }
}

function renderCurrentPictureLibrary(layout, preview) {
  if (preview.pictures.length === 0) {
    currentPictureLibrary.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'picture-library-status',
      textContent: '这是空白关卡。请从“项目总图片”选择素材，或从“导入图片”添加素材。',
    }));
    return;
  }
  const cards = preview.pictures.map((picture, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'picture-card';
    const isSelected = state.selectedPictureIndex === index;
    const isDragSource = draggedCurrentPictureIndex === index;
    const isDragTarget = dragTargetCurrentPictureIndex === index;
    card.classList.toggle('is-preselected', isSelected);
    card.classList.toggle('is-drag-source', isDragSource);
    card.classList.toggle('is-drag-target', isDragTarget);
    card.setAttribute('aria-pressed', String(isSelected));
    card.title = selectedProjectPicture == null
      ? '点击切换预览图片；拖动到另一张图片可交换位置'
      : `点击图片 #${String(index + 1).padStart(2, '0')} 作为替换目标`;
    card.setAttribute('aria-label', selectedProjectPicture == null
      ? `使用本关图片 ${String(index + 1).padStart(2, '0')} 试玩；拖动可交换位置`
      : `替换本关图片 ${String(index + 1).padStart(2, '0')}`);
    const image = document.createElement('img');
    image.src = getPictureUrl(picture.imagePath);
    image.alt = `图片 ${String(index + 1).padStart(2, '0')}`;
    image.loading = 'lazy';
    card.append(image);
    card.addEventListener('click', () => {
      if (selectedProjectPicture != null) replaceCurrentPicture(index);
      else if (suppressCurrentPictureClick) suppressCurrentPictureClick = false;
      else selectCurrentPicture(index);
    });
    card.dataset.currentPictureIndex = String(index);
    card.addEventListener('pointerdown', (event) => beginCurrentPicturePointerDrag(event, index));
    return card;
  });
  currentPictureLibrary.replaceChildren(...cards);
}

function renderPictureCards(library, pictures, { deletable = false } = {}) {
  const cards = pictures.map((picture) => {
    const isSelected = selectedProjectPicture?.imagePath === picture.imagePath;
    const image = document.createElement('img');
    image.src = getPictureUrl(picture.imagePath);
    image.alt = getPictureName(picture);
    image.loading = 'lazy';
    if (!deletable) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'picture-card project-picture-card';
      card.classList.toggle('is-preselected', isSelected);
      card.setAttribute('aria-pressed', String(isSelected));
      card.title = picture.name ?? picture.imagePath;
      card.setAttribute('aria-label', `将 ${getPictureName(picture)} 添加到本关图片`);
      card.append(image);
      card.addEventListener('click', () => addPictureToCurrentLevel(picture));
      return card;
    }

    const card = document.createElement('article');
    card.className = 'picture-card project-picture-card imported-picture-card';
    card.classList.toggle('is-preselected', isSelected);
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'project-picture-select';
    selectButton.setAttribute('aria-pressed', String(isSelected));
    selectButton.title = picture.name ?? picture.imagePath;
    selectButton.setAttribute('aria-label', `使用 ${getPictureName(picture)} 替换本关图片`);
    selectButton.append(image);
    selectButton.addEventListener('click', () => selectProjectPicture(picture));
    card.append(selectButton);
    {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'delete-picture-button';
      deleteButton.textContent = '删除';
      deleteButton.setAttribute('aria-label', `删除导入图片 ${getPictureName(picture)}`);
      deleteButton.addEventListener('click', () => deleteImportedPicture(picture));
      card.append(deleteButton);
    }
    return card;
  });
  library.replaceChildren(...cards);
}

function renderProjectPictureLibrary(pictures) {
  const source = projectPictureSource.value;
  const query = projectPictureSearch.value.trim().toLowerCase();
  const filtered = pictures.filter((picture) =>
    (source === 'all' || (source === 'official' ? !picture.source : picture.source === source)) &&
    (query === '' || (picture.name ?? picture.imagePath.split('/').at(-1)).toLowerCase().includes(query)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / projectPicturePageSize));
  projectPicturePageIndex = Math.min(projectPicturePageIndex, pageCount - 1);
  const pageStart = projectPicturePageIndex * projectPicturePageSize;
  pictureLibraryTitle.textContent = `项目拼图图片（${filtered.length} / ${pictures.length} 张）`;
  projectPicturePage.textContent = `${projectPicturePageIndex + 1} / ${pageCount}`;
  projectPicturePrevious.disabled = projectPicturePageIndex === 0;
  projectPictureNext.disabled = projectPicturePageIndex >= pageCount - 1;
  renderPictureCards(pictureLibrary, filtered.slice(pageStart, pageStart + projectPicturePageSize));
  if (filtered.length === 0) pictureLibrary.textContent = '没有匹配的图片。';
}

function renderImportedPictureLibrary(pictures) {
  importPictureLibraryTitle.textContent = `导入图片（${pictures.length} 张）`;
  if (pictures.length === 0) {
    importedPictureLibrary.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'picture-library-status',
      textContent: '尚未导入图片。',
    }));
    return;
  }
  renderPictureCards(importedPictureLibrary, pictures, { deletable: true });
}

async function deleteImportedPicture(picture) {
  try {
    await deleteSavedPicture('puzzle', picture);
    const result = removeImportedPicture(importedPictures, picture.imagePath);
    if (!result.removed) return;
    importedPictures = result.pictures;
    if (selectedProjectPicture?.imagePath === picture.imagePath) selectedProjectPicture = null;
    renderPictureLibrary(activeLayout, activePreview);
    canvasTip.textContent = `已从项目拼图图片中删除 ${getPictureName(picture)}。`;
  } catch (error) {
    canvasTip.textContent = `删除导入图片失败：${error.message}`;
  }
}

function selectProjectPicture(picture) {
  if (activeLayout == null || activePreview == null) return;
  const alreadySelected = selectedProjectPicture?.imagePath === picture.imagePath;
  selectedProjectPicture = alreadySelected ? null : picture;
  state = { ...state, selectedSceneTileSlot: null, selectedPictureIndex: null };
  renderPictureLibrary(activeLayout, activePreview);
  renderPreview(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = alreadySelected
    ? '已取消项目图片选择。'
    : '图片已选中；可点击“添加到本关”，或切换到“本关图片”点击目标进行替换。';
}

function addSelectedPictureToLevel() {
  addPictureToCurrentLevel(selectedProjectPicture);
}

function addPictureToCurrentLevel(picture) {
  if (activeLayout == null || activePreview == null) return;
  if (picture == null) {
    canvasTip.textContent = '请先在“项目总图片”或“导入图片”中选择一张图片。';
    return;
  }

  const pictureName = getPictureName(picture);
  const result = activeLayout.pictures.length === 0
    ? addPictureToLayout(activeLayout, picture)
    : addPictureToLevelLibrary(activeLayout, picture);
  if (!result.added) {
    canvasTip.textContent = result.reason === 'duplicate'
      ? `图片 ${pictureName} 已经在本关中。`
      : '当前关卡结构不支持新增图片。';
    return;
  }

  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  selectedProjectPicture = null;
  state = { ...state, selectedPictureIndex: result.pictureIndex, selectedSceneTileSlot: null };
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = `已将 ${pictureName} 添加到本关图片，正在保存…`;
  saveLevelChanges(activeLevel.id, activeLayout);
}

function replaceCurrentPicture(pictureIndex) {
  if (activeLayout == null || activePreview == null) return;
  if (selectedProjectPicture == null) {
    canvasTip.textContent = '请先在“项目拼图图片”中选择一张图片。';
    return;
  }

  const replacementName = getPictureName(selectedProjectPicture);
  const result = replacePictureInLayout(activeLayout, pictureIndex, selectedProjectPicture);
  if (!result.replaced) return;
  selectedProjectPicture = null;
  state = { ...state, selectedPictureIndex: null, selectedSceneTileSlot: null };
  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = `已将本关图片 ${pictureIndex + 1} 替换为 ${replacementName}。`;
  saveLevelChanges(activeLevel.id, activeLayout);
}

function deleteSelectedCurrentPicture() {
  if (activeLayout == null || activePreview == null || state.selectedPictureIndex == null) return;
  const pictureIndex = state.selectedPictureIndex;
  const pictureName = getPictureName(activeLayout.pictures[pictureIndex]);
  const result = removePictureFromLayout(activeLayout, pictureIndex);
  if (!result.removed) {
    canvasTip.textContent = result.reason === 'last-picture'
      ? '本关至少需要保留一张图片，不能删除最后一张。'
      : '无法删除当前选中的本关图片。';
    return;
  }

  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  state = { ...state, selectedPictureIndex: null, selectedSceneTileSlot: null };
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = `已从本关删除 ${pictureName}。`;
  saveLevelChanges(activeLevel.id, activeLayout);
}

function renderPictureLibrary(layout, preview) {
  renderCurrentPictureLibrary(layout, preview);
  renderImportedPictureLibrary(importedPictures);
  const selection = selectedProjectPicture?.imagePath ?? null;
  if (pictureLibrary.childElementCount === 0 || renderedProjectPictureSelection !== selection) {
    renderProjectPictureLibrary(getProjectPictureLibrary(getAllProjectPictures()));
    renderedProjectPictureSelection = selection;
  }
}

function selectCurrentPicture(pictureIndex) {
  if (activeLayout == null || activePreview == null) return;
  state = { ...state, selectedPictureIndex: pictureIndex };
  renderPreview(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderCurrentPictureLibrary(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = '已切换预览图片；拖动可交换位置，或使用“删除选中”。';
}

function beginCurrentPicturePointerDrag(event, pictureIndex) {
  if (selectedProjectPicture != null) {
    return;
  }
  draggedCurrentPictureIndex = pictureIndex;
  dragTargetCurrentPictureIndex = null;
  currentPicturePointerId = event.pointerId;
  isCurrentPicturePointerDragging = false;
  state = { ...state, selectedPictureIndex: pictureIndex };
  renderPreview(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  showCurrentPictureDragPreview(event, activeLayout.pictures[pictureIndex]);
  updateCurrentPictureDragClasses();
  renderShell();
  canvasTip.textContent = '已切换预览图片；拖动可交换位置，或使用“删除选中”。';
}

function updateCurrentPicturePointerDrag(event) {
  if (event.pointerId !== currentPicturePointerId || draggedCurrentPictureIndex == null) return;
  moveDragPreview(event);
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-current-picture-index]');
  const targetIndex = target == null ? null : Number(target.dataset.currentPictureIndex);
  const nextTargetIndex = Number.isInteger(targetIndex) && targetIndex !== draggedCurrentPictureIndex ? targetIndex : null;
  if (nextTargetIndex === dragTargetCurrentPictureIndex) return;
  isCurrentPicturePointerDragging = true;
  dragTargetCurrentPictureIndex = nextTargetIndex;
  updateCurrentPictureDragClasses();
}

function endCurrentPicturePointerDrag(event) {
  if (event.pointerId !== currentPicturePointerId || draggedCurrentPictureIndex == null || activeLayout == null || activePreview == null) return;
  const sourceIndex = draggedCurrentPictureIndex;
  const targetIndex = isCurrentPicturePointerDragging ? dragTargetCurrentPictureIndex : null;
  draggedCurrentPictureIndex = null;
  dragTargetCurrentPictureIndex = null;
  currentPicturePointerId = null;
  isCurrentPicturePointerDragging = false;
  suppressCurrentPictureClick = true;
  hideDragPreview();
  const result = swapPicturesByIndex(activeLayout.pictures, sourceIndex, targetIndex);
  if (!result.swapped) {
    updateCurrentPictureDragClasses();
    return;
  }
  activeLayout = { ...activeLayout, pictures: result.pictures };
  activePreview = createLevelPreview(activeLayout);
  state = { ...state, selectedPictureIndex: null };
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  renderShell();
  canvasTip.textContent = `已交换本关图片 ${sourceIndex + 1} 和 ${targetIndex + 1} 的位置；棋盘和候场队列预览已同步更新。`;
  saveLevelChanges(activeLevel.id, activeLayout);
}

function cancelCurrentPicturePointerDrag(event) {
  if (event.pointerId !== currentPicturePointerId) return;
  draggedCurrentPictureIndex = null;
  dragTargetCurrentPictureIndex = null;
  currentPicturePointerId = null;
  isCurrentPicturePointerDragging = false;
  suppressCurrentPictureClick = true;
  hideDragPreview();
  updateCurrentPictureDragClasses();
}

function updateCurrentPictureDragClasses() {
  currentPictureLibrary.querySelectorAll('[data-current-picture-index]').forEach((card) => {
    const pictureIndex = Number(card.dataset.currentPictureIndex);
    card.classList.toggle('is-preselected', state.selectedPictureIndex === pictureIndex);
    card.setAttribute('aria-pressed', String(state.selectedPictureIndex === pictureIndex));
    card.classList.toggle('is-drag-source', draggedCurrentPictureIndex === pictureIndex);
    card.classList.toggle('is-drag-target', dragTargetCurrentPictureIndex === pictureIndex);
  });
}

function showCurrentPictureDragPreview(event, picture) {
  if (picture?.imagePath == null) return;
  dragPreview.style.backgroundImage = `url("${getPictureUrl(picture.imagePath)}")`;
  dragPreview.style.backgroundSize = 'cover';
  dragPreview.style.backgroundPosition = 'center';
  dragPreview.hidden = false;
  moveDragPreview(event);
}

function getValidation(layout, preview) {
  const tiles = [...preview.boardTiles.filter(Boolean), ...preview.queueTiles.flat()];
  const usedPictureCount = new Set(tiles.map((tile) => tile.pictureIndex)).size;
  const expectedTileCount = (usedPictureCount || preview.pictureCount) * preview.matchSize * preview.matchSize;
  const identities = new Set();
  const invalidTiles = tiles.filter((tile) => {
    const key = `${tile.pictureIndex}_${tile.tileIndex}`;
    const isDuplicate = identities.has(key);
    identities.add(key);
    return !Number.isInteger(tile.pictureIndex) || !Number.isInteger(tile.tileIndex) ||
      tile.pictureIndex < 0 || tile.pictureIndex >= preview.pictureCount ||
      tile.tileIndex < 0 || tile.tileIndex >= preview.matchSize * preview.matchSize || isDuplicate;
  });
  const hasExpectedColumns = Array.isArray(layout.queues) && layout.queues.length === preview.gridSize;
  return { expectedTileCount, actualTileCount: tiles.length, invalidTiles, hasExpectedColumns };
}

function renderMetadata(layout, preview) {
  const validation = getValidation(layout, preview);
  const firstTile = preview.boardTiles.find(Boolean) ?? preview.queueTiles.flat()[0];
  inspectorTitle.textContent = '棋盘信息';
  inspectorResource.textContent = `资源：${firstTile ? getPictureName({ imagePath: getPicturePath(layout, firstTile) }) : '--'}`;
  inspectorGrid.textContent = `拼图规格：${preview.matchSize} × ${preview.matchSize}　棋盘：${preview.gridSize} × ${preview.gridSize}`;
  inspectorPlacement.textContent = firstTile ? `示例切片：图片 ${firstTile.pictureIndex + 1} / 第 ${firstTile.tileIndex} 块` : '初始位置：--';
  const isValid = validation.actualTileCount === validation.expectedTileCount && validation.invalidTiles.length === 0 && validation.hasExpectedColumns;
  validationSummary.className = isValid ? 'validation-summary is-valid' : 'validation-summary is-invalid';
  validationSummary.innerHTML = `关卡完整性：${isValid ? '✓' : '✕'}<br>碎片数量：${validation.actualTileCount} / ${validation.expectedTileCount}<br>开局棋盘：${preview.boardTiles.filter(Boolean).length} 格<br>后续掉落：${preview.queueTiles.flat().length} 块`;
  canvasTip.textContent = isValid
    ? `开局 ${preview.gridSize} × ${preview.gridSize}：每列队首从底部填入；剩余切片从棋盘上方按列候场。`
    : '当前关卡数据不完整，已保留可显示的切片。';
  renderBoardFormatControls(preview.gridSize, { resetSelection: true });
}

function applySelectedBoardFormat() {
  if (activeLayout == null || activePreview == null) return;
  const targetSize = Number(boardFormatSelect.value);
  const currentSize = activePreview.gridSize;
  if (targetSize === currentSize) return;
  const result = changeBoardFormat(activeLayout, targetSize);
  if (!result.changed) {
    boardFormatHelp.textContent = result.reason === 'insufficient-tiles'
      ? `切片不足，无法填满 ${targetSize} × ${targetSize} 开局棋盘。`
      : '当前关卡结构不支持该棋盘格式。';
    renderBoardFormatControls(currentSize);
    return;
  }
  const changeDescription = result.reason === 'resliced'
    ? '图片会按新格式重新切片，当前切片排列会重置。'
    : '全部切片会重新分配到目标列。';
  if (!window.confirm(`确定将棋盘从 ${currentSize} × ${currentSize} 改为 ${targetSize} × ${targetSize}？\n${changeDescription}`)) return;

  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  selectedProjectPicture = null;
  state = { ...state, selectedPictureIndex: null, selectedSceneTileSlot: null };
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  boardFormatHelp.textContent = result.reason === 'resliced'
    ? `已切换为 ${targetSize} × ${targetSize}，图片已重新切片。`
    : `已切换为 ${targetSize} × ${targetSize}；全部切片已重新分配到 ${targetSize} 列。`;
  renderShell();
  saveLevelChanges(activeLevel.id, activeLayout, '棋盘格式已自动保存。');
}

async function getCustomLevels() {
  const response = await fetch('./api/custom-levels');
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.levels)) throw new Error(payload.error ?? '无法读取自定义关卡');
  return payload.levels;
}

async function getLevelNames() {
  const response = await fetch('./api/level-names');
  const payload = await response.json();
  if (!response.ok || payload.names == null || typeof payload.names !== 'object' || Array.isArray(payload.names)) {
    throw new Error(payload.error ?? '无法读取关卡名称');
  }
  return payload.names;
}

async function renameCurrentLevel() {
  if (activeLevel == null || renameLevelButton.dataset.busy === 'true') return;
  const levelId = activeLevel.id;
  const previousName = levelNames[levelId] ?? `关卡 ${formatLevel(levelId)}`;
  const input = window.prompt('输入关卡名称（1–40 个字符）', previousName);
  if (input == null) return;
  const name = input.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 40) {
    canvasTip.textContent = '关卡名称需为 1 到 40 个字符。';
    return;
  }
  if (name === previousName) return;
  renameLevelButton.dataset.busy = 'true';
  renderShell();
  renderAutoSaveStatus('名称保存中…');
  try {
    const response = await fetch('./api/level-names', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ levelId, name }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? '重命名失败');
    levelNames = { ...levelNames, [levelId]: payload.name };
    renderLevelGrid();
    if (activeLevel?.id === levelId) canvasTip.textContent = `已重命名为“${payload.name}”，名称已自动保存。`;
    renderAutoSaveStatus('已自动保存');
  } catch (error) {
    canvasTip.textContent = `重命名失败：${error.message}`;
    renderAutoSaveStatus('名称保存失败');
  } finally {
    delete renameLevelButton.dataset.busy;
    renameLevelButton.disabled = activeLevel == null;
  }
}

async function postCustomLevel(level) {
  const response = await fetch('./api/custom-levels', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? '新建关卡失败');
  return payload.level;
}

async function deleteCustomLevel(levelId) {
  const response = await fetch(`./api/custom-levels?levelId=${encodeURIComponent(levelId)}`, { method: 'DELETE' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? '删除关卡失败');
  return payload.removed === true;
}

async function loadDraft(levelId) {
  const response = await fetch(`./api/level-drafts?levelId=${encodeURIComponent(levelId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? '无法读取草稿');
  return getUsableDraft(payload.draft, levelId);
}

async function postDraft(draft) {
  const response = await fetch('./api/level-drafts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? '草稿保存失败');
  return payload.draft;
}

function enqueueDraftWrite(draft) {
  const write = draftWriteQueue.catch(() => {}).then(() => postDraft(draft));
  draftWriteQueue = write;
  return write;
}

async function saveLevelChanges(levelId, layout, successMessage = '关卡已自动保存。') {
  const draft = createDraftPayload(levelId, layout, selectedGameBackground);
  if (draft == null) return;
  if (activeLevel?.id === levelId && activeLayout === layout) renderAutoSaveStatus('自动保存中…');
  try {
    await enqueueDraftWrite(draft);
    if (activeLevel?.id === levelId && activeLayout === layout) {
      renderAutoSaveStatus('已自动保存');
      canvasTip.textContent = successMessage;
    }
  } catch (error) {
    if (activeLevel?.id === levelId) {
      renderAutoSaveStatus('自动保存失败');
      canvasTip.textContent = `本关自动保存失败：${error.message}`;
    }
  }
}

async function exportCurrentLevel() {
  if (activeLevel == null || activeLayout == null || exportLevelButton.dataset.busy === 'true') return;
  exportLevelButton.dataset.busy = 'true';
  exportLevelButton.textContent = '导出中…';
  renderShell();
  try {
    const response = await fetch('./api/export-level', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: activeLevel,
        layout: activeLayout,
        pictureIndex: state.selectedPictureIndex ?? 0,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? '关卡导出失败');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `level-${activeLevel.id}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    canvasTip.textContent = `关卡 ${formatLevel(activeLevel.id)} 已导出。`;
  } catch (error) {
    canvasTip.textContent = `导出失败：${error.message}`;
  } finally {
    delete exportLevelButton.dataset.busy;
    exportLevelButton.textContent = '导出此关';
    renderShell();
  }
}

async function loadSelectedLevel(levelId, { deferUntilDraft = false } = {}) {
  const loadSequence = ++levelLoadSequence;
  try {
    const level = getOfficialLevel(levelId) ?? customLevels.find((candidate) => candidate.id === levelId && candidate.enabled);
    const layout = level?.variants?.[0]?.layout;
    if (layout == null) throw new Error(`关卡 ${formatLevel(levelId)} 缺少可用布局`);
    if (!deferUntilDraft) {
      applyLoadedLevel(levelId, level, layout, null);
      canvasTip.textContent = `已加载原始关卡 ${formatLevel(levelId)}。`;
    }
    await importedPicturesReady;
    let draft = null;
    let draftLoadError = false;
    try {
      draft = await loadDraft(levelId);
    } catch {
      draftLoadError = true;
    }
    if (loadSequence !== levelLoadSequence || (!deferUntilDraft && activeLayout !== layout)) return;
    if (draft != null || deferUntilDraft) {
      applyLoadedLevel(levelId, level, draft?.layout ?? layout,
        getRestorableDraftBackground(draft?.selectedGameBackground));
    }
    canvasTip.textContent = draftLoadError
      ? '草稿不可用，已使用原始关卡。'
      : draft == null
        ? `已加载原始关卡 ${formatLevel(levelId)}。`
        : `已加载关卡 ${formatLevel(levelId)} 的草稿。`;
  } catch (error) {
    if (loadSequence !== levelLoadSequence) return;
    puzzleBoard.replaceChildren();
    runtimeBoard.replaceChildren();
    runtimeQueueColumns.replaceChildren();
    pictureLibrary.replaceChildren();
    canvasTip.textContent = `无法加载关卡：${error.message}`;
    validationSummary.className = 'validation-summary is-invalid';
    validationSummary.textContent = '关卡预览不可用，请通过本地 HTTP 服务打开编辑器。';
  }
}

function applyLoadedLevel(levelId, level, layout, background) {
  state = { ...state, levelId, selectedPictureIndex: null, selectedSceneTileSlot: null };
  selectedProjectPicture = null;
  activeLevel = level;
  activeLayout = layout;
  selectedGameBackground = background;
  activePreview = createLevelPreview(layout);
  renderLevelGrid(levelId);
  applyGameBackground();
  renderPreview(layout, activePreview);
  renderPictureLibrary(layout, activePreview);
  renderGameBackgroundLibrary();
  renderMetadata(layout, activePreview);
  renderShell();
}

function renderLevelGrid(currentLevelId = state.levelId) {
  const levelIds = [...new Set([
    ...[...customLevels].reverse().map((level) => level.id),
    ...Array.from({ length: lastOfficialLevelId }, (_, index) => index + 1),
  ])];
  const buttons = levelIds.map((levelId) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level-button';
    button.dataset.levelId = String(levelId);
    const defaultName = `关卡 ${formatLevel(levelId)}`;
    const name = levelNames[levelId] ?? defaultName;
    const nameLabel = document.createElement('span');
    nameLabel.className = 'level-button-name';
    nameLabel.textContent = name;
    button.append(nameLabel);
    button.title = name === defaultName ? defaultName : `${name} · ${defaultName}`;
    if (name !== defaultName) {
      const numberLabel = document.createElement('span');
      numberLabel.className = 'level-button-number';
      numberLabel.textContent = defaultName;
      button.append(numberLabel);
    }
    button.classList.toggle('is-active', levelId === currentLevelId);
    if (levelId === currentLevelId) button.setAttribute('aria-current', 'true');
    return button;
  });
  levelGrid.replaceChildren(...buttons);
}

async function createNewLevel() {
  if (activeLevel == null) return;
  const nextLevelId = Math.max(lastOfficialLevelId, ...customLevels.map((level) => level.id)) + 1;
  const level = createEmptyCustomLevel(nextLevelId, lastOfficialLevelId + 1);
  if (level == null) {
    canvasTip.textContent = '无法创建空白关卡。';
    return;
  }
  newLevelButton.disabled = true;
  try {
    const created = await postCustomLevel(level);
    customLevels = [...customLevels, created];
    renderLevelGrid(created.id);
    await loadSelectedLevel(created.id);
    levelGrid.scrollTop = 0;
    canvasTip.textContent = `已新建并保存空白关卡 ${formatLevel(created.id)}。请添加图片后再试玩。`;
  } catch (error) {
    canvasTip.textContent = `新建关卡失败：${error.message}`;
  } finally {
    renderShell();
  }
}

async function deleteCurrentLevel() {
  if (activeLevel == null || !customLevels.some((level) => level.id === activeLevel.id)) return;
  const levelId = activeLevel.id;
  if (!window.confirm(`确定删除关卡 ${formatLevel(levelId)}？该关卡及其草稿将无法恢复。`)) return;
  deleteLevelButton.disabled = true;
  try {
    await deleteCustomLevel(levelId);
    customLevels = customLevels.filter((level) => level.id !== levelId);
    delete levelNames[levelId];
    state = { ...state, levelId: firstOfficialLevelId, selectedPictureIndex: null, selectedSceneTileSlot: null };
    renderLevelGrid();
    await loadSelectedLevel(firstOfficialLevelId);
    canvasTip.textContent = `已删除关卡 ${formatLevel(levelId)}。`;
  } catch (error) {
    canvasTip.textContent = `删除关卡失败：${error.message}`;
  } finally {
    renderShell();
  }
}

sidebarToggle.addEventListener('click', () => {
  state = reduceEditorState(state, { type: 'toggle-sidebar' });
  renderShell();
});
hudToggle.addEventListener('click', () => {
  state = reduceEditorState(state, { type: 'set-preview-hud-visible', visible: !state.previewHudVisible });
  seamscapePreviewBridge?.setHudVisible(state.previewHudVisible);
  renderShell();
});
seamscapePreviewToggle.addEventListener('click', toggleSeamscapePreview);
seamscapeDemoOpen.addEventListener('click', () => seamscapePreviewBridge?.openDemo());
exportLevelButton.addEventListener('click', exportCurrentLevel);
window.addEventListener('pagehide', () => seamscapePreviewBridge?.dispose());
new ResizeObserver(updateSeamscapePreviewFrameScale).observe(seamscapePreviewFrame.parentElement);
importPicturesButton.addEventListener('click', () => pictureImportInput.click());
function updateProjectPictureFilter() {
  projectPicturePageIndex = 0;
  renderProjectPictureLibrary(getAllProjectPictures());
  renderedProjectPictureSelection = selectedProjectPicture?.imagePath ?? null;
}
projectPictureSource.addEventListener('change', updateProjectPictureFilter);
projectPictureSearch.addEventListener('input', updateProjectPictureFilter);
projectPicturePrevious.addEventListener('click', () => {
  projectPicturePageIndex -= 1;
  renderProjectPictureLibrary(getAllProjectPictures());
});
projectPictureNext.addEventListener('click', () => {
  projectPicturePageIndex += 1;
  renderProjectPictureLibrary(getAllProjectPictures());
});
pictureImportInput.addEventListener('change', () => importPictures(pictureImportInput.files));
addPictureToLevelButton.addEventListener('click', addSelectedPictureToLevel);
deleteCurrentPictureButton.addEventListener('click', deleteSelectedCurrentPicture);
newLevelButton.addEventListener('click', createNewLevel);
renameLevelButton.addEventListener('click', renameCurrentLevel);
deleteLevelButton.addEventListener('click', deleteCurrentLevel);
boardFormatSelect.addEventListener('change', () => renderBoardFormatControls());
applyBoardFormatButton.addEventListener('click', applySelectedBoardFormat);
importBackgroundsButton.addEventListener('click', () => backgroundImportInput.click());
backgroundImportInput.addEventListener('change', () => importGameBackgrounds(backgroundImportInput.files));
adjustBackgroundButton.addEventListener('click', () => {
  backgroundSettingsPanel.hidden = !backgroundSettingsPanel.hidden;
  adjustBackgroundButton.setAttribute('aria-expanded', String(!backgroundSettingsPanel.hidden));
});
backgroundFitSelect.addEventListener('change', () => updateSelectedBackgroundSettings({ fit: backgroundFitSelect.value }));
backgroundScaleInput.addEventListener('input', () => {
  backgroundScaleValue.textContent = `${backgroundScaleInput.value}%`;
  updateSelectedBackgroundSettings({ scale: Number(backgroundScaleInput.value) / 100 });
});
for (const [input, key] of [[backgroundWidthInput, 'width'], [backgroundHeightInput, 'height']]) {
  input.addEventListener('change', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = String(Math.round((key === 'width' ? getGameBackgroundWidth : getGameBackgroundHeight)(selectedGameBackground) * 100));
      return;
    }
    const normalized = Math.min(200, Math.max(50, Math.round(value)));
    input.value = String(normalized);
    updateSelectedBackgroundSettings({ [key]: normalized / 100 });
  });
}
levelGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-level-id]');
  if (button == null || !levelGrid.contains(button)) return;
  const levelId = Number(button.dataset.levelId);
  if (levelId !== state.levelId) loadSelectedLevel(levelId);
});
window.addEventListener('pointermove', updateCurrentPicturePointerDrag);
window.addEventListener('pointerup', endCurrentPicturePointerDrag);
window.addEventListener('pointercancel', cancelCurrentPicturePointerDrag);
window.addEventListener('pointermove', updateSceneTilePointerDrag);
window.addEventListener('pointerup', endSceneTilePointerDrag);
window.addEventListener('pointercancel', cancelSceneTilePointerDrag);
assetButtons.forEach((button) => button.addEventListener('click', () => {
  const workspace = button.dataset.inspectorWorkspace;
  state = reduceEditorState(state, { type: 'select-inspector-workspace', workspace });
  state = reduceEditorState(state, { type: 'select-inspector-section', section: workspace === 'board' ? 'board' : 'assets' });
  if (workspace === 'project' || workspace === 'current') {
    state = reduceEditorState(state, { type: 'set-asset-library', library: workspace });
  }
  renderPictureLibrary(activeLayout, activePreview);
  renderGameBackgroundLibrary();
  renderMetadata(activeLayout, activePreview);
  renderShell();
}));
document.addEventListener('keydown', (event) => {
  if (!isEditorUiToggleKey(event)) return;
  event.preventDefault();
  state = reduceEditorState(state, { type: 'toggle-sidebar' });
  renderShell();
});
sceneCanvas.addEventListener('pointerdown', (event) => {
  if (!isScenePanPointerButton(event.button)) return;
  event.preventDefault();
  sceneCanvas.setPointerCapture(event.pointerId);
  panningPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  sceneCanvas.classList.add('is-panning');
});
sceneCanvas.addEventListener('pointermove', (event) => {
  if (panningPointer?.id !== event.pointerId) return;
  sceneViewport = panSceneViewport(
    sceneViewport,
    event.clientX - panningPointer.x,
    event.clientY - panningPointer.y,
  );
  panningPointer = { ...panningPointer, x: event.clientX, y: event.clientY };
  renderSceneViewport();
});
function endScenePan(event) {
  if (panningPointer?.id !== event.pointerId) return;
  panningPointer = undefined;
  sceneCanvas.classList.remove('is-panning');
}
sceneCanvas.addEventListener('pointerup', endScenePan);
sceneCanvas.addEventListener('pointercancel', endScenePan);
sceneCanvas.addEventListener('lostpointercapture', endScenePan);
sceneCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
sceneCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const rect = sceneCanvas.getBoundingClientRect();
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  const point = getSceneViewportPoint(event.clientX, event.clientY, rect);
  sceneViewport = zoomSceneViewportAtPoint(
    sceneViewport,
    factor,
    point.x,
    point.y,
  );
  renderSceneViewport();
}, { passive: false });

async function initializeEditor() {
  renderLevelGrid();
  renderShell();
  renderSceneViewport();
  renderGameBackgroundLibrary();
  importedPicturesReady = restoreImportedPictures();
  getLevelNames().then((names) => {
    levelNames = names;
    renderLevelGrid();
  }).catch((error) => {
    canvasTip.textContent = `无法读取关卡名称：${error.message}`;
  });
  loadSelectedLevel(state.levelId);
  projectCatalogsReady = Promise.all(['pending-square', 'square-2'].map(async (source) => {
    try {
      const response = await fetch(`./resources/images/${source}/catalog.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      if (!Array.isArray(catalog.pictures)) throw new Error('图片索引无效');
      return catalog.pictures;
    } catch (error) {
      canvasTip.textContent = `无法读取 ${source} 图片素材：${error.message}`;
      return [];
    }
  })).then(([pending, squareTwo]) => {
    pendingSquarePictures = pending;
    squareTwoPictures = squareTwo;
    renderedProjectPictureSelection = undefined;
    if (activeLayout != null) renderPictureLibrary(activeLayout, activePreview);
  });
  await projectCatalogsReady;
  try {
    customLevels = await getCustomLevels();
    renderLevelGrid();
    renderShell();
  } catch (error) {
    canvasTip.textContent = `无法读取自定义关卡：${error.message}`;
  }
}

initializeEditor();
