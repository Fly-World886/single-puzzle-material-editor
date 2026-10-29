import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as editorState from './editor-state.mjs';
import {
  addImportedPictures,
  addPictureToLayout,
  addPictureToLevelLibrary,
  changeBoardFormat,
  createDraftPayload,
  calculateExternalQueueLayout,
  calculateSceneLayout,
  createSceneViewport,
  getProjectPictureLibrary,
  getUsableDraft,
  createLevelPreview,
  createEditorState,
  getWorkspaceViewModel,
  getSceneViewportPoint,
  isScenePanPointerButton,
  isEditorUiToggleKey,
  panSceneViewport,
  reduceEditorState,
  replacePictureInLayout,
  removeImportedPicture,
  selectOrSwapSceneTile,
  swapSceneTilesBySlot,
  moveSelectedTopStoredSceneTile,
  moveSceneTileToColumn,
  swapPicturesByIndex,
  zoomSceneViewportAtPoint,
} from './editor-state.mjs';

test('creates a detached versioned draft payload including a selected background', () => {
  const layout = { boardSize: { width: 4, height: 4 }, queues: [{ tiles: [] }], pictures: [] };
  const background = { imagePath: 'imported/background/forest.png', fingerprint: 'forest', name: 'forest.png', imported: true };
  const draft = createDraftPayload(1, layout, background);

  layout.boardSize.width = 6;
  background.name = 'changed.png';
  assert.deepEqual(draft, {
    version: 1,
    levelId: 1,
    layout: { boardSize: { width: 4, height: 4 }, queues: [{ tiles: [] }], pictures: [] },
    selectedGameBackground: { imagePath: 'imported/background/forest.png', fingerprint: 'forest', name: 'forest.png', imported: true },
  });
});

test('accepts only a matching complete draft with a supported square board', () => {
  const draft = {
    version: 1,
    levelId: 5,
    layout: { boardSize: { width: 5, height: 5 }, queues: [], pictures: [] },
    selectedGameBackground: null,
  };
  assert.equal(getUsableDraft(draft, 5), draft);
  assert.equal(getUsableDraft({ ...draft, levelId: 6 }, 5), null);
  assert.equal(getUsableDraft({ ...draft, version: 2 }, 5), null);
  assert.equal(getUsableDraft({ ...draft, layout: { ...draft.layout, boardSize: { width: 5, height: 4 } } }, 5), null);
  assert.equal(getUsableDraft({ ...draft, selectedGameBackground: { imagePath: '../outside.png' } }, 5), null);
  const { selectedGameBackground, ...incompleteDraft } = draft;
  assert.equal(getUsableDraft(incompleteDraft, 5), null);
});

test('creates an empty saved custom level after the official Seamscape levels', () => {
  const created = editorState.createEmptyCustomLevel(11, 11);

  assert.deepEqual(created, {
    id: 11,
    enabled: true,
    variants: [{
      tier: 1,
      difficulty: 0,
      layout: {
        boardSize: { width: 4, height: 4 },
        matchSize: { width: 4, height: 4 },
        tilePixelSize: { width: 180, height: 260 },
        pictures: [],
        queues: [{ tiles: [] }, { tiles: [] }, { tiles: [] }, { tiles: [] }],
      },
    }],
  });
  assert.equal(editorState.createEmptyCustomLevel(10, 11), null);
});

test('splits the first selected picture to fill every supported new-level board format', () => {
  for (const size of [3, 4, 5, 6, 7]) {
    const emptyLevel = editorState.createEmptyCustomLevel(11, 11);
    const layout = emptyLevel.variants[0].layout;
    const resized = editorState.changeBoardFormat(layout, size);
    const result = addPictureToLayout(resized.layout, { imagePath: `new-${size}.png` });
    const tiles = result.layout.queues.flatMap((queue) => queue.tiles);

    assert.equal(result.added, true);
    assert.deepEqual(result.layout.boardSize, { width: size, height: size });
    assert.deepEqual(result.layout.matchSize, { width: size, height: size });
    assert.equal(tiles.length, size * size);
    assert.equal(new Set(tiles.map((tile) => tile.tileIndex)).size, size * size);
    assert.deepEqual(result.layout.queues.map((queue) => queue.tiles.length), Array(size).fill(size));
  }
});

test('recognizes H as the editor UI toggle shortcut outside editable controls', () => {
  assert.equal(isEditorUiToggleKey({ key: 'h', target: { tagName: 'BODY' } }), true);
  assert.equal(isEditorUiToggleKey({ key: 'H', target: { tagName: 'DIV' } }), true);
  assert.equal(isEditorUiToggleKey({ key: 'h', ctrlKey: true, target: { tagName: 'BODY' } }), false);
  assert.equal(isEditorUiToggleKey({ key: 'h', target: { tagName: 'INPUT' } }), false);
  assert.equal(isEditorUiToggleKey({ key: 'h', target: { tagName: 'DIV', isContentEditable: true } }), false);
});

test('adds a new picture and appends its four slices to the four queue tops', () => {
  const layout = {
    boardSize: { width: 4, height: 4 },
    matchSize: { width: 2, height: 2 },
    pictures: [{ imagePath: 'old.png' }],
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }] },
      { tiles: [{ pictureIndex: 0, tileIndex: 1 }] },
      { tiles: [{ pictureIndex: 0, tileIndex: 2 }] },
      { tiles: [{ pictureIndex: 0, tileIndex: 3 }] },
    ],
  };

  const result = addPictureToLayout(layout, { imagePath: 'new.png', name: 'new.png' });

  assert.equal(result.added, true);
  assert.equal(result.pictureIndex, 1);
  assert.deepEqual(result.layout.pictures, [{ imagePath: 'old.png' }, { imagePath: 'new.png' }]);
  assert.deepEqual(result.layout.queues.map((queue) => queue.tiles.at(-1)), [
    { pictureIndex: 1, tileIndex: 0 },
    { pictureIndex: 1, tileIndex: 1 },
    { pictureIndex: 1, tileIndex: 2 },
    { pictureIndex: 1, tileIndex: 3 },
  ]);
  assert.deepEqual(layout.pictures, [{ imagePath: 'old.png' }]);
  assert.deepEqual(layout.queues.map((queue) => queue.tiles.length), [1, 1, 1, 1]);
});

test('does not add a picture already present in the current level', () => {
  const layout = {
    boardSize: { width: 4, height: 4 },
    matchSize: { width: 2, height: 2 },
    pictures: [{ imagePath: 'existing.png' }],
    queues: [{ tiles: [] }, { tiles: [] }, { tiles: [] }, { tiles: [] }],
  };

  const result = addPictureToLayout(layout, { imagePath: 'existing.png' });

  assert.equal(result.added, false);
  assert.equal(result.reason, 'duplicate');
  assert.equal(result.layout, layout);
});

test('adds a picture to the level library without changing the playable queue', () => {
  const layout = {
    pictures: [{ imagePath: 'one.png' }],
    queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }] }],
  };
  const result = addPictureToLevelLibrary(layout, { imagePath: 'two.png' });
  assert.equal(result.added, true);
  assert.deepEqual(result.layout.pictures, [{ imagePath: 'one.png' }, { imagePath: 'two.png' }]);
  assert.equal(result.layout.queues, layout.queues);
  assert.equal(addPictureToLevelLibrary(result.layout, { imagePath: 'two.png' }).reason, 'duplicate');
});

test('repartitions every tile when changing a 4x4 layout to 5x5', () => {
  const tiles = Array.from({ length: 28 }, (_, index) => ({ pictureIndex: Math.floor(index / 4), tileIndex: index % 4 }));
  const layout = {
    boardSize: { width: 4, height: 4 },
    matchSize: { width: 2, height: 2 },
    pictures: Array.from({ length: 7 }, (_, index) => ({ imagePath: `${index}.png` })),
    queues: Array.from({ length: 4 }, (_, column) => ({ tiles: tiles.filter((_, index) => index % 4 === column) })),
  };
  const before = structuredClone(layout);
  const sourceOrder = layout.queues.flatMap((queue) => queue.tiles);
  const result = changeBoardFormat(layout, 5);

  assert.equal(result.changed, true);
  assert.deepEqual(result.layout.boardSize, { width: 5, height: 5 });
  assert.equal(result.layout.queues.length, 5);
  assert.deepEqual(result.layout.queues, Array.from({ length: 5 }, (_, column) => ({ tiles: sourceOrder.filter((_, index) => index % 5 === column) })));
  assert.deepEqual(layout, before);
});

test('reslices a playable single-image board when its format changes', () => {
  const layout = {
    boardSize: { width: 3, height: 3 },
    matchSize: { width: 3, height: 3 },
    pictures: [{ imagePath: 'one.png' }, { imagePath: 'two.png' }],
    queues: Array.from({ length: 3 }, (_, column) => ({ tiles: [0, 1, 2].map((row) => ({
      pictureIndex: 0, tileIndex: row * 3 + column,
    })) })),
  };
  const result = changeBoardFormat(layout, 4);
  assert.equal(result.changed, true);
  assert.deepEqual(result.layout.boardSize, { width: 4, height: 4 });
  assert.deepEqual(result.layout.matchSize, { width: 4, height: 4 });
  assert.deepEqual(result.layout.pictures, layout.pictures);
  assert.deepEqual(result.layout.queues, Array.from({ length: 4 }, (_, column) => ({ tiles: [0, 1, 2, 3].map((row) => ({
    pictureIndex: 0, tileIndex: row * 4 + column,
  })) })));
  const seven = changeBoardFormat(result.layout, 7);
  assert.equal(seven.layout.queues.flatMap((queue) => queue.tiles).length, 49);
  assert.deepEqual(seven.layout.matchSize, { width: 7, height: 7 });
  assert.equal(changeBoardFormat(seven.layout, 3).layout.queues.flatMap((queue) => queue.tiles).length, 9);
  assert.deepEqual(layout.boardSize, { width: 3, height: 3 });
});

test('supports 5x5 to 6x6 and 6x6 to 4x4 with stable tile order', () => {
  const tiles = Array.from({ length: 36 }, (_, index) => ({ pictureIndex: Math.floor(index / 4), tileIndex: index % 4 }));
  const layout = {
    boardSize: { width: 5, height: 5 },
    matchSize: { width: 2, height: 2 },
    pictures: Array.from({ length: 9 }, (_, index) => ({ imagePath: `${index}.png` })),
    queues: Array.from({ length: 5 }, (_, column) => ({ tiles: tiles.filter((_, index) => index % 5 === column) })),
  };
  const sourceOrder = layout.queues.flatMap((queue) => queue.tiles);
  const toSix = changeBoardFormat(layout, 6);
  const toFour = changeBoardFormat(toSix.layout, 4);

  assert.equal(toSix.layout.queues.length, 6);
  assert.equal(toFour.layout.queues.length, 4);
  assert.equal(new Set(toSix.layout.queues.flatMap((queue) => queue.tiles).map((tile) => `${tile.pictureIndex}:${tile.tileIndex}`)).size, 36);
  assert.ok(Math.max(...toSix.layout.queues.map((queue) => queue.tiles.length)) - Math.min(...toSix.layout.queues.map((queue) => queue.tiles.length)) <= 1);
  assert.deepEqual(toSix.layout.queues, Array.from({ length: 6 }, (_, column) => ({ tiles: sourceOrder.filter((_, index) => index % 6 === column) })));
});

test('rejects unsupported, malformed, unchanged, and tile-insufficient format changes', () => {
  const layout = { boardSize: { width: 4, height: 4 }, queues: [{ tiles: Array(16).fill({ pictureIndex: 0, tileIndex: 0 }) }] };
  assert.equal(changeBoardFormat(layout, 4).reason, 'unchanged');
  assert.equal(changeBoardFormat(layout, 2).reason, 'invalid-target');
  assert.equal(changeBoardFormat(layout, 3).layout.boardSize.width, 3);
  assert.equal(changeBoardFormat({ boardSize: { width: 4, height: 4 } }, 5).reason, 'invalid-layout');
  const insufficient = changeBoardFormat(layout, 5);
  assert.equal(insufficient.reason, 'insufficient-tiles');
  assert.equal(insufficient.layout, layout);
  assert.equal(insufficient.changed, false);
});

test('removes a current-level picture, its slices, and reindexes later picture slices', () => {
  const layout = {
    pictures: [
      { imagePath: 'first.png' },
      { imagePath: 'remove.png' },
      { imagePath: 'third.png' },
    ],
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 0 }, { pictureIndex: 2, tileIndex: 0 }] },
      { tiles: [{ pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 2, tileIndex: 1 }] },
    ],
  };

  assert.equal(typeof editorState.removePictureFromLayout, 'function');
  const result = editorState.removePictureFromLayout(layout, 1);

  assert.equal(result.removed, true);
  assert.deepEqual(result.layout.pictures.map((picture) => picture.imagePath), ['first.png', 'third.png']);
  assert.deepEqual(result.layout.queues, [
    { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 0 }] },
    { tiles: [{ pictureIndex: 1, tileIndex: 1 }] },
  ]);
  assert.deepEqual(layout.queues[0].tiles.map((tile) => tile.pictureIndex), [0, 1, 2]);
});

test('keeps the final current-level picture to preserve a playable level', () => {
  const layout = { pictures: [{ imagePath: 'only.png' }], queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }] }] };

  assert.equal(typeof editorState.removePictureFromLayout, 'function');
  const result = editorState.removePictureFromLayout(layout, 0);

  assert.equal(result.removed, false);
  assert.equal(result.reason, 'last-picture');
  assert.equal(result.layout, layout);
});

test('keeps the board playable when removing its displayed picture from a gallery', () => {
  const layout = {
    pictures: [{ imagePath: 'first.png' }, { imagePath: 'second.png' }],
    queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }] }],
  };
  const result = editorState.removePictureFromLayout(layout, 0);
  assert.deepEqual(result.layout.pictures, [{ imagePath: 'second.png' }]);
  assert.deepEqual(result.layout.queues, layout.queues);
});

test('adds imported pictures once when their contents do not duplicate project or imported pictures', () => {
  assert.equal(typeof editorState.addImportedPictures, 'function');
  const existing = [{ imagePath: 'data:image/png;base64,existing', fingerprint: 'hash-existing', name: 'existing.png' }];
  const incoming = [
    { imagePath: 'data:image/png;base64,duplicate-project', fingerprint: 'hash-project', name: 'duplicate-project.png' },
    { imagePath: 'data:image/png;base64,new', fingerprint: 'hash-new', name: 'new.png' },
    { imagePath: 'data:image/png;base64,duplicate-new', fingerprint: 'hash-new', name: 'duplicate-new.png' },
  ];

  const result = addImportedPictures(existing, incoming, ['hash-project']);

  assert.equal(result.added, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.pictures, [
    { imagePath: 'data:image/png;base64,existing', fingerprint: 'hash-existing', name: 'existing.png' },
    { imagePath: 'data:image/png;base64,new', fingerprint: 'hash-new', name: 'new.png' },
  ]);
  assert.deepEqual(existing, [{ imagePath: 'data:image/png;base64,existing', fingerprint: 'hash-existing', name: 'existing.png' }]);
});

test('adds game backgrounds once when their contents do not duplicate an imported background', () => {
  assert.equal(typeof editorState.addImportedBackgrounds, 'function');
  const result = editorState.addImportedBackgrounds(
    [{ imagePath: 'data:image/png;base64,existing', fingerprint: 'background-existing', name: 'existing.png' }],
    [
      { imagePath: 'data:image/png;base64,duplicate', fingerprint: 'background-existing', name: 'duplicate.png' },
      { imagePath: 'data:image/png;base64,new', fingerprint: 'background-new', name: 'new.png' },
    ],
  );

  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.pictures.map((picture) => picture.imagePath), [
    'data:image/png;base64,existing',
    'data:image/png;base64,new',
  ]);
});

test('removes only the requested imported game background', () => {
  assert.equal(typeof editorState.removeImportedBackground, 'function');
  const backgrounds = [
    { imagePath: 'data:image/png;base64,first', fingerprint: 'background-first', name: 'first.png' },
    { imagePath: 'data:image/png;base64,second', fingerprint: 'background-second', name: 'second.png' },
  ];

  const result = editorState.removeImportedBackground(backgrounds, 'data:image/png;base64,first');

  assert.equal(result.removed, true);
  assert.deepEqual(result.pictures.map((picture) => picture.imagePath), ['data:image/png;base64,second']);
});

test('uses Unity game background when no imported background is selected', () => {
  assert.equal(typeof editorState.getGameBackgroundImagePath, 'function');

  assert.equal(editorState.getGameBackgroundImagePath(null), null);
  assert.equal(
    editorState.getGameBackgroundImagePath({ imagePath: 'data:image/png;base64,custom-background' }),
    'data:image/png;base64,custom-background',
  );
});

test('classifies imported background media without confusing videos for images', () => {
  assert.equal(typeof editorState.getGameBackgroundMediaType, 'function');
  assert.equal(editorState.getGameBackgroundMediaType({ mimeType: 'video/mp4', imagePath: 'imported/background/a.mp4' }), 'video');
  assert.equal(editorState.getGameBackgroundMediaType({ mimeType: 'image/png', imagePath: 'imported/background/a.png' }), 'image');
  assert.equal(editorState.getGameBackgroundMediaType({ imagePath: 'imported/background/a.webm' }), 'video');
});

test('normalizes background fit and scale settings for images and videos', () => {
  assert.equal(editorState.getGameBackgroundFit({ fit: 'contain' }), 'contain');
  assert.equal(editorState.getGameBackgroundFit({ fit: 'stretch' }), 'stretch');
  assert.equal(editorState.getGameBackgroundFit({ fit: 'unknown' }), 'cover');
  assert.equal(editorState.getGameBackgroundScale({ scale: 1.35 }), 1.35);
  assert.equal(editorState.getGameBackgroundScale({ scale: 0.1 }), 0.5);
  assert.equal(editorState.getGameBackgroundScale({ scale: 9 }), 2);
  assert.equal(editorState.getGameBackgroundScale({ scale: 'bad' }), 1);
});

test('normalizes precise background width and height settings', () => {
  assert.equal(editorState.getGameBackgroundWidth({ width: 1.25 }), 1.25);
  assert.equal(editorState.getGameBackgroundHeight({ height: 0.1 }), 0.5);
  assert.equal(editorState.getGameBackgroundWidth({ width: 4 }), 2);
  assert.equal(editorState.getGameBackgroundHeight({ height: 'bad' }), 1);
});

test('keeps imported pictures out of the project picture library', () => {
  assert.equal(typeof editorState.getProjectPictureLibrary, 'function');

  const pictures = getProjectPictureLibrary(
    [{ imagePath: 'images/project.png' }],
    [{ imagePath: 'data:image/png;base64,imported', fingerprint: 'hash-imported', name: 'imported.png', imported: true }],
  );

  assert.deepEqual(pictures.map((picture) => picture.imagePath), [
    'images/project.png',
  ]);
});

test('removes only the requested imported picture', () => {
  assert.equal(typeof editorState.removeImportedPicture, 'function');
  const imported = [
    { imagePath: 'data:image/png;base64,first', fingerprint: 'hash-first', name: 'first.png' },
    { imagePath: 'data:image/png;base64,second', fingerprint: 'hash-second', name: 'second.png' },
  ];

  const result = removeImportedPicture(imported, 'data:image/png;base64,first');

  assert.equal(result.removed, true);
  assert.deepEqual(result.pictures, [{ imagePath: 'data:image/png;base64,second', fingerprint: 'hash-second', name: 'second.png' }]);
  assert.deepEqual(imported, [
    { imagePath: 'data:image/png;base64,first', fingerprint: 'hash-first', name: 'first.png' },
    { imagePath: 'data:image/png;base64,second', fingerprint: 'hash-second', name: 'second.png' },
  ]);
});

test('replaces only the selected current-level picture path while preserving its other settings', () => {
  const layout = {
    pictures: [
      { imagePath: 'images/current-one.png', videoPath: 'one.mp4', audioPath: 'one.mp3' },
      { imagePath: 'images/current-two.png', videoPath: 'two.mp4', audioPath: 'two.mp3' },
    ],
  };

  const result = replacePictureInLayout(layout, 1, { imagePath: 'images/project-picture.png' });

  assert.equal(result.replaced, true);
  assert.deepEqual(result.layout.pictures, [
    { imagePath: 'images/current-one.png', videoPath: 'one.mp4', audioPath: 'one.mp3' },
    { imagePath: 'images/project-picture.png', videoPath: 'two.mp4', audioPath: 'two.mp3' },
  ]);
  assert.deepEqual(layout.pictures, [
    { imagePath: 'images/current-one.png', videoPath: 'one.mp4', audioPath: 'one.mp3' },
    { imagePath: 'images/current-two.png', videoPath: 'two.mp4', audioPath: 'two.mp3' },
  ]);
});

test('starts scene panning only from the right mouse button', () => {
  assert.equal(isScenePanPointerButton(2), true);
  assert.equal(isScenePanPointerButton(0), false);
  assert.equal(isScenePanPointerButton(1), false);
});

test('allows right-button scene panning regardless of the target type', () => {
  for (const targetType of ['canvas', 'phone', 'board', 'tile']) {
    assert.equal(isScenePanPointerButton(2), true, `${targetType} should allow right-button panning`);
  }
});

test('maps pointer coordinates relative to the scene composition center', () => {
  assert.deepEqual(
    getSceneViewportPoint(300, 250, { left: 100, top: 50, width: 400, height: 300 }),
    { x: 0, y: 50 },
  );
});

test('collects every project picture once when different paths contain identical image data', async () => {
  assert.equal(typeof editorState.collectUniqueProjectPictures, 'function');
  const project = {
    levels: [
      { variants: [{ layout: { pictures: [{ imagePath: 'images/one.png' }, { imagePath: 'images/two.png' }] } }] },
      { variants: [{ layout: { pictures: [{ imagePath: 'images/duplicate.png' }, { imagePath: 'images/three.png' }] } }] },
    ],
  };
  const contentHashes = new Map([
    ['images/one.png', 'hash-a'],
    ['images/two.png', 'hash-b'],
    ['images/duplicate.png', 'hash-a'],
    ['images/three.png', 'hash-c'],
  ]);

  const pictures = await editorState.collectUniqueProjectPictures(project, async (imagePath) => contentHashes.get(imagePath));

  assert.deepEqual(pictures.map((picture) => picture.imagePath), [
    'images/one.png',
    'images/two.png',
    'images/three.png',
  ]);
});

test('keeps a project picture visible when its fingerprint request fails', async () => {
  const project = { levels: [{ variants: [{ layout: { pictures: [
    { imagePath: 'images/one.png' }, { imagePath: 'images/two.png' },
  ] } }] }] };
  const pictures = await editorState.collectUniqueProjectPictures(project, async (imagePath) => {
    if (imagePath === 'images/two.png') throw new Error('temporary fetch failure');
    return 'hash-one';
  });
  assert.deepEqual(pictures.map((picture) => picture.imagePath), ['images/one.png', 'images/two.png']);
});

test('lists project image paths without downloading their contents', async () => {
  const project = { levels: [{ variants: [{ layout: { pictures: [
    { imagePath: 'images/one.png' }, { imagePath: 'images/two.png' }, { imagePath: 'images/one.png' },
  ] } }] }] };
  const pictures = await editorState.collectUniqueProjectPictures(project);
  assert.deepEqual(pictures.map((picture) => picture.imagePath), ['images/one.png', 'images/two.png']);
});

test('creates a scene viewport at the origin with unit zoom', () => {
  assert.deepEqual(createSceneViewport(), { x: 0, y: 0, zoom: 1 });
});

test('pans a scene viewport by accumulated canvas-local deltas', () => {
  const initial = createSceneViewport();
  const afterFirstPan = panSceneViewport(initial, 24, -10);
  const afterSecondPan = panSceneViewport(afterFirstPan, -4, 30);

  assert.deepEqual(afterSecondPan, { x: 20, y: 20, zoom: 1 });
  assert.deepEqual(initial, { x: 0, y: 0, zoom: 1 });
});

test('clamps scene viewport zoom to its supported range', () => {
  assert.equal(zoomSceneViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 10, 100, 80).zoom, 2);
  assert.equal(zoomSceneViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 0.01, 100, 80).zoom, 0.5);
});

test('zooms a scene viewport around the canvas-local pointer', () => {
  assert.deepEqual(
    zoomSceneViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 2, 100, 80),
    { x: -100, y: -80, zoom: 2 },
  );
});

test('normalizes null and Symbol viewport inputs to the viewport defaults', () => {
  assert.deepEqual(
    panSceneViewport(null, Symbol('delta-x'), Symbol('delta-y')),
    { x: 0, y: 0, zoom: 1 },
  );
  assert.deepEqual(
    zoomSceneViewportAtPoint(null, Symbol('factor'), Symbol('point-x'), Symbol('point-y')),
    { x: 0, y: 0, zoom: 1 },
  );
});

test('keeps overflowing scene pan offsets finite', () => {
  const viewport = panSceneViewport(
    { x: Number.MAX_VALUE, y: -Number.MAX_VALUE, zoom: 1 },
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
  );

  assert.ok(Number.isFinite(viewport.x));
  assert.ok(Number.isFinite(viewport.y));
});

test('keeps overflowing pointer-centered zoom offsets finite', () => {
  const viewport = zoomSceneViewportAtPoint(
    { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE, zoom: 1 },
    2,
    Number.MAX_VALUE,
    Number.MAX_VALUE,
  );

  assert.ok(Number.isFinite(viewport.x));
  assert.ok(Number.isFinite(viewport.y));
});

test('fits expanded external queues for each supported grid size', () => {
  const cases = [
    { gridSize: 3, queueLengths: [3, 3, 3] },
    { gridSize: 4, queueLengths: [3, 6, 5, 2] },
    { gridSize: 5, queueLengths: [3, 5, 4, 5, 2] },
    { gridSize: 6, queueLengths: [4, 4, 4, 4, 4, 4] },
    { gridSize: 7, queueLengths: [7, 7, 7, 7, 7, 7, 7] },
  ];

  for (const { gridSize, queueLengths } of cases) {
    const board = calculateSceneLayout({
      gridSize,
      tilePixelSize: { width: 180, height: 260 },
      containerWidth: 196,
      containerHeight: 315,
      mode: 'editor',
    });
    const layout = calculateExternalQueueLayout({
      gridSize,
      tilePixelSize: { width: 180, height: 260 },
      queueLengths,
      boardWidth: board.boardWidth,
      queueHeight: 315,
      mode: 'editor',
    });

    assert.equal(layout.boardWidth, board.boardWidth, `${gridSize}×${gridSize} queue shares the board width`);
    assert.ok(layout.queueHeight <= 315, `${gridSize}×${gridSize} queue fits its external area`);
    assert.ok(Math.abs(layout.boardWidth - layout.tileWidth * gridSize) < 0.001);
  }
});

test('uses compact overlap for runtime external pending queues', () => {
  const input = {
    gridSize: 4,
    tilePixelSize: { width: 180, height: 260 },
    queueLengths: [6, 5, 4, 3],
    containerWidth: 166,
    containerHeight: 250,
  };

  const board = calculateSceneLayout({ ...input, mode: 'editor' });
  const editor = calculateExternalQueueLayout({ ...input, boardWidth: board.boardWidth, queueHeight: 250, mode: 'editor' });
  const runtime = calculateExternalQueueLayout({ ...input, boardWidth: board.boardWidth, queueHeight: 250, mode: 'runtime' });

  assert.ok(runtime.queueHeight < editor.queueHeight);
  assert.ok(runtime.queueHeight <= 250);
});

test('keeps a six-column board stable when pending queue lengths change', () => {
  const board = {
    gridSize: 6,
    tilePixelSize: { width: 180, height: 260 },
    containerWidth: 196,
    containerHeight: 315,
    mode: 'editor',
  };

  const shortQueue = calculateSceneLayout({ ...board, queueLengths: [0, 0, 0, 0, 0, 0] });
  const longQueue = calculateSceneLayout({ ...board, queueLengths: [4, 4, 4, 4, 4, 4] });

  assert.equal(shortQueue.boardWidth, longQueue.boardWidth);
  assert.equal(shortQueue.boardHeight, longQueue.boardHeight);
});

test('measures an editor external queue against the supplied board and height', () => {
  const layout = calculateExternalQueueLayout({
    gridSize: 6,
    tilePixelSize: { width: 180, height: 260 },
    queueLengths: [4, 4, 4, 4, 4, 4],
    boardWidth: 196,
    queueHeight: 220,
    mode: 'editor',
  });

  assert.equal(layout.boardWidth, 196);
  assert.ok(layout.queueHeight <= 220);
  assert.equal(layout.queueTileStep, layout.tileHeight);
  assert.ok(Number.isFinite(layout.compositionHeight));
});

test('scales a long editor queue so its complete expanded stack fits the external height', () => {
  const layout = calculateExternalQueueLayout({
    gridSize: 4,
    tilePixelSize: { width: 180, height: 260 },
    queueLengths: [6, 6, 6, 6],
    boardWidth: 196,
    queueHeight: 250,
    mode: 'editor',
  });
  const expandedStackHeight = 15 + layout.tileHeight + 5 * layout.queueTileStep;

  assert.equal(layout.tileWidth, 49);
  assert.equal(layout.queueTileStep, layout.tileHeight);
  assert.ok(expandedStackHeight <= 250);
  assert.equal(layout.queueHeight, expandedStackHeight);
});

test('places each column queue front at the bottom of the preview board', () => {
  const preview = createLevelPreview({
    boardSize: { width: 2, height: 2 },
    matchSize: { width: 2, height: 2 },
    pictures: [{ imagePath: 'images/level_0001/image_000.png' }],
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 0, tileIndex: 2 }] },
      { tiles: [{ pictureIndex: 0, tileIndex: 1 }, { pictureIndex: 0, tileIndex: 3 }] },
    ],
  });

  assert.deepEqual(preview.boardTiles.map((tile) => tile?.tileIndex ?? null), [2, 3, 0, 1]);
  assert.deepEqual(preview.queueTiles, [[], []]);
  assert.equal(preview.pictureCount, 1);
  assert.equal(preview.totalTileCount, 4);
});

test('keeps items beyond the initial board as a pending column queue', () => {
  const preview = createLevelPreview({
    boardSize: { width: 2, height: 2 },
    matchSize: { width: 2, height: 2 },
    pictures: [{ imagePath: 'images/level_0001/image_000.png' }],
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 0, tileIndex: 2 }, { pictureIndex: 0, tileIndex: 1 }] },
      { tiles: [{ pictureIndex: 0, tileIndex: 3 }] },
    ],
  });

  assert.deepEqual(preview.boardTiles.map((tile) => tile?.tileIndex ?? null), [2, null, 0, 3]);
  assert.deepEqual(preview.queueTiles.map((queue) => queue.map((tile) => tile.tileIndex)), [[1], []]);
  assert.equal(preview.totalTileCount, 4);
});

test('stacks pending column tiles above the board with the next drop closest to it', () => {
  const preview = createLevelPreview({
    boardSize: { width: 2, height: 2 },
    matchSize: { width: 2, height: 2 },
    pictures: [{ imagePath: 'images/level_0001/image_000.png' }],
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 0, tileIndex: 2 }, { pictureIndex: 0, tileIndex: 1 }, { pictureIndex: 0, tileIndex: 3 }] },
      { tiles: [] },
    ],
  });

  assert.deepEqual(preview.queueTiles[0].map((tile) => tile.tileIndex), [1, 3]);
  assert.deepEqual(preview.queueStackTiles.map((queue) => queue.map((tile) => tile.tileIndex)), [[3, 1], []]);
});

test('projects the first Seamscape square level into its visible board', async () => {
  const importedPack = JSON.parse(await readFile(new URL('./resources/levels/main/seamscape-square-levels.json', import.meta.url), 'utf8'));
  const level = importedPack.levels.find((candidate) => candidate.id === 1);
  const layout = level.variants[0].layout;
  const preview = createLevelPreview(layout);

  assert.equal(level.seamscape.imageIndex, 1);
  assert.equal(layout.pictures[0].imagePath, 'images/seamscape/Square_0001.jpg');
  assert.equal(preview.gridSize, 3);
  assert.equal(preview.matchSize, 3);
  assert.equal(preview.pictureCount, 1);
  assert.equal(preview.boardTiles.filter(Boolean).length, 9);
  assert.equal(preview.queueTiles.flat().length, 0);
  assert.equal(preview.totalTileCount, 9);
  assert.equal(importedPack.levels.length, 10);
  assert.equal(importedPack.levels.at(-1).id, 10);
});

test('creates an editable level state with the runtime HUD visible by default', () => {
  const state = createEditorState(51);

  assert.deepEqual(state, {
    levelId: 51,
    sidebarCollapsed: false,
    activeInspectorSection: 'assets',
    activeAssetLibrary: 'project',
    activeInspectorWorkspace: 'project',
    previewHudVisible: true,
    previewRunning: false,
    selectedPictureIndex: null,
    selectedSceneTileSlot: null,
  });
});

test('swaps current pictures only when a dragged picture is dropped on another picture', () => {
  const pictures = [{ imagePath: 'first.png' }, { imagePath: 'second.png' }, { imagePath: 'third.png' }];
  const result = swapPicturesByIndex(pictures, 0, 2);

  assert.deepEqual(result.pictures.map((picture) => picture.imagePath), ['third.png', 'second.png', 'first.png']);
  assert.deepEqual(pictures.map((picture) => picture.imagePath), ['first.png', 'second.png', 'third.png']);
  assert.equal(result.swapped, true);
});

test('keeps current pictures unchanged when a drag has no different picture target', () => {
  const pictures = [{ imagePath: 'first.png' }, { imagePath: 'second.png' }];
  const samePicture = swapPicturesByIndex(pictures, 0, 0);
  const invalidTarget = swapPicturesByIndex(pictures, 0, 3);

  assert.equal(samePicture.swapped, false);
  assert.equal(samePicture.pictures, pictures);
  assert.equal(invalidTarget.swapped, false);
  assert.equal(invalidTarget.pictures, pictures);
});

test('preselects a scene tile without changing the level queue', () => {
  const layout = {
    queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }] }],
  };
  const slot = { column: 0, queueIndex: 0 };
  const result = selectOrSwapSceneTile(createEditorState(1), layout, slot);

  assert.deepEqual(result.state.selectedSceneTileSlot, slot);
  assert.equal(result.swapped, false);
  assert.equal(result.layout, layout);
});

test('swaps scene tiles only when a dragged tile is dropped on a different tile', () => {
  const layout = {
    queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }] }],
  };
  const result = swapSceneTilesBySlot(layout, { column: 0, queueIndex: 0 }, { column: 0, queueIndex: 1 });

  assert.deepEqual(result.layout.queues[0].tiles, [{ pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 0, tileIndex: 0 }]);
  assert.deepEqual(layout.queues[0].tiles, [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }]);
  assert.equal(result.swapped, true);
});

test('keeps scene tiles unchanged when a dragged tile has no different target', () => {
  const layout = { queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }] }] };
  const slot = { column: 0, queueIndex: 0 };
  const result = swapSceneTilesBySlot(layout, slot, slot);

  assert.equal(result.swapped, false);
  assert.equal(result.layout, layout);
});

test('moves a dragged scene tile into a blank board column and collapses the source tiles downward', () => {
  const layout = {
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 2, tileIndex: 2 }] },
      { tiles: [{ pictureIndex: 3, tileIndex: 3 }] },
    ],
  };
  const result = moveSceneTileToColumn(layout, { column: 0, queueIndex: 1 }, 1);

  assert.deepEqual(result.layout.queues[0].tiles, [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 2, tileIndex: 2 }]);
  assert.deepEqual(result.layout.queues[1].tiles, [{ pictureIndex: 3, tileIndex: 3 }, { pictureIndex: 1, tileIndex: 1 }]);
  assert.deepEqual(layout.queues[0].tiles, [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 2, tileIndex: 2 }]);
  assert.equal(result.moved, true);
});

test('moves a dragged scene tile to the top of its own column and closes its old gap', () => {
  const layout = {
    queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 2, tileIndex: 2 }] }],
  };
  const result = moveSceneTileToColumn(layout, { column: 0, queueIndex: 1 }, 0);

  assert.deepEqual(result.layout.queues[0].tiles, [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 2, tileIndex: 2 }, { pictureIndex: 1, tileIndex: 1 }]);
  assert.deepEqual(layout.queues[0].tiles, [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 2, tileIndex: 2 }]);
  assert.equal(result.moved, true);
});

test('moves a selected top stored tile to another queue top', () => {
  const layout = {
    boardSize: { width: 1, height: 1 },
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }] },
      { tiles: [{ pictureIndex: 2, tileIndex: 2 }] },
    ],
  };
  const selected = selectOrSwapSceneTile(createEditorState(1), layout, { column: 0, queueIndex: 1 });
  const result = moveSelectedTopStoredSceneTile(selected.state, layout, 1);

  assert.deepEqual(result.layout.queues[0].tiles, [{ pictureIndex: 0, tileIndex: 0 }]);
  assert.deepEqual(result.layout.queues[1].tiles, [{ pictureIndex: 2, tileIndex: 2 }, { pictureIndex: 1, tileIndex: 1 }]);
  assert.equal(result.state.selectedSceneTileSlot, null);
  assert.equal(result.moved, true);
});

test('does not move a non-top stored tile to another queue top', () => {
  const layout = {
    boardSize: { width: 1, height: 1 },
    queues: [
      { tiles: [{ pictureIndex: 0, tileIndex: 0 }, { pictureIndex: 1, tileIndex: 1 }, { pictureIndex: 2, tileIndex: 2 }] },
      { tiles: [{ pictureIndex: 3, tileIndex: 3 }] },
    ],
  };
  const result = moveSelectedTopStoredSceneTile(
    { ...createEditorState(1), selectedSceneTileSlot: { column: 0, queueIndex: 1 } },
    layout,
    1,
  );

  assert.equal(result.moved, false);
  assert.equal(result.layout, layout);
});

test('cancels scene tile preselection when the selected slot is clicked again', () => {
  const layout = { queues: [{ tiles: [{ pictureIndex: 0, tileIndex: 0 }] }] };
  const slot = { column: 0, queueIndex: 0 };
  const first = selectOrSwapSceneTile(createEditorState(1), layout, slot);
  const result = selectOrSwapSceneTile(first.state, layout, slot);

  assert.equal(result.state.selectedSceneTileSlot, null);
  assert.equal(result.swapped, false);
  assert.equal(result.layout, layout);
});

test('updates only the requested workspace control', () => {
  const initial = createEditorState(51);
  const sidebarCollapsed = reduceEditorState(initial, { type: 'toggle-sidebar' });
  const hudHidden = reduceEditorState(sidebarCollapsed, { type: 'set-preview-hud-visible', visible: false });
  const running = reduceEditorState(hudHidden, { type: 'set-preview-running', running: true });

  assert.equal(running.sidebarCollapsed, true);
  assert.equal(running.previewHudVisible, false);
  assert.equal(running.previewRunning, true);
  assert.equal(running.levelId, 51);
  assert.equal(running.activeInspectorSection, 'assets');
});

test('switches the active asset library without changing preview controls', () => {
  const initial = createEditorState(51);
  const currentPictures = reduceEditorState(initial, { type: 'set-asset-library', library: 'current' });
  const invalidLibrary = reduceEditorState(currentPictures, { type: 'set-asset-library', library: 'unsupported' });

  assert.equal(currentPictures.activeAssetLibrary, 'current');
  assert.equal(currentPictures.previewRunning, false);
  assert.equal(invalidLibrary, currentPictures);
});

test('switches the inspector workspace to each top navigation target', () => {
  const initial = createEditorState(51);
  const currentPictures = reduceEditorState(initial, { type: 'select-inspector-workspace', workspace: 'current' });
  const importer = reduceEditorState(currentPictures, { type: 'select-inspector-workspace', workspace: 'import' });
  const invalidWorkspace = reduceEditorState(importer, { type: 'select-inspector-workspace', workspace: 'unknown' });

  assert.equal(currentPictures.activeInspectorWorkspace, 'current');
  assert.equal(importer.activeInspectorWorkspace, 'import');
  assert.equal(invalidWorkspace, importer);
});

test('projects editor state into labels and CSS flags for the workspace shell', () => {
  const state = reduceEditorState(
    reduceEditorState(createEditorState(51), { type: 'toggle-sidebar' }),
    { type: 'set-preview-hud-visible', visible: false },
  );

  assert.deepEqual(getWorkspaceViewModel(state), {
    appClassName: 'editor-app sidebar-collapsed',
    sidebarToggleLabel: '› 展开工具栏',
    previewStatus: '已就绪',
    previewHudLabel: 'HUD 已隐藏',
  });
});
