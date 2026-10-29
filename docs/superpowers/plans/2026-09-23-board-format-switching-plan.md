# 棋盘规格切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在棋盘工作区支持把当前关卡切换为 4×4、5×5 或 6×6，并以不可变、可校验的方式重排队列，使编辑场景、运行预览和 WebGL 试玩同步更新。

**Architecture:** 把棋盘规格迁移封装为 `editor-state.mjs` 中的纯函数 `changeBoardFormat(layout, targetSize)`。UI 只负责选择、确认、调用纯函数和刷新现有渲染链；`createLevelPreview()` 继续根据每列前 N 张切片生成开局棋盘，因此不新增第二份棋盘状态。

**Tech Stack:** 原生 HTML/CSS、ES modules、Node built-in test runner、现有 WebGL preview bridge。

## Global Constraints

- 仅支持 4×4、5×5、6×6；不支持自定义长宽或矩形棋盘。
- `layout.matchSize`、`layout.pictures` 及所有切片身份 `{ pictureIndex, tileIndex }` 不改变。
- 目标开局格数超过现有切片总数时拒绝操作并保留原布局。
- 本次只修改内存中的当前草稿，沿用既有保存、校验和导出流程。
- 所有状态函数必须不可变，不修改传入布局或其队列数组。

### Task 1: Add and test the board-format migration pure function

**Files:**
- Modify: `editor-state.mjs` (place beside other layout mutation helpers, after `addPictureToLayout`)
- Modify: `editor-state.test.mjs` (add import and migration tests near other layout mutation tests)

**Interfaces:**
- Consumes: `layout` with `boardSize`, `queues`, and tile objects; `targetSize` number.
- Produces: `{ layout, changed, reason }`, where successful output has `changed: true`, and rejected output returns the original layout reference with `changed: false`.

- [ ] **Step 1: Add failing tests for successful 4→5 migration.**

Add `changeBoardFormat` to the named imports from `./editor-state.mjs` before adding this test:

```js
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
```

- [ ] **Step 2: Add failing tests for 5→6 and 6→4, balanced queues, and identity preservation.**

```js
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
```

- [ ] **Step 3: Add failing tests for no-op and rejection reasons.**

```js
test('rejects unsupported, malformed, unchanged, and tile-insufficient format changes', () => {
  const layout = { boardSize: { width: 4, height: 4 }, queues: [{ tiles: Array(16).fill({ pictureIndex: 0, tileIndex: 0 }) }] };
  assert.equal(changeBoardFormat(layout, 4).reason, 'unchanged');
  assert.equal(changeBoardFormat(layout, 3).reason, 'invalid-target');
  assert.equal(changeBoardFormat({ boardSize: { width: 4, height: 4 } }, 5).reason, 'invalid-layout');
  const insufficient = changeBoardFormat(layout, 5);
  assert.equal(insufficient.reason, 'insufficient-tiles');
  assert.equal(insufficient.layout, layout);
  assert.equal(insufficient.changed, false);
});
```

- [ ] **Step 4: Run the focused tests and verify they fail because `changeBoardFormat` is not defined.**

Run: `node --test --test-name-pattern='repartitions|supports 5x5|rejects unsupported' editor-state.test.mjs`

Expected: FAIL with the missing export/function error.

- [ ] **Step 5: Implement `changeBoardFormat(layout, targetSize)` minimally.**

Use this exact behavior:

```js
const SupportedBoardSizes = new Set([4, 5, 6]);

export function changeBoardFormat(layout, targetSize) {
  const size = Number(targetSize);
  if (!SupportedBoardSizes.has(size)) return { layout, changed: false, reason: 'invalid-target' };
  const currentWidth = Number(layout?.boardSize?.width);
  const currentHeight = Number(layout?.boardSize?.height);
  const queues = Array.isArray(layout?.queues) ? layout.queues : null;
  if (!Number.isInteger(currentWidth) || currentWidth <= 0 || currentHeight !== currentWidth || queues == null) {
    return { layout, changed: false, reason: 'invalid-layout' };
  }
  if (currentWidth === size) return { layout, changed: false, reason: 'unchanged' };
  const tiles = queues.flatMap((queue) => (Array.isArray(queue?.tiles) ? queue.tiles : []));
  if (tiles.length < size * size) return { layout, changed: false, reason: 'insufficient-tiles' };
  const nextQueues = Array.from({ length: size }, () => ({ tiles: [] }));
  tiles.forEach((tile, index) => nextQueues[index % size].tiles.push(tile));
  return {
    layout: { ...layout, boardSize: { width: size, height: size }, queues: nextQueues },
    changed: true,
    reason: 'changed',
  };
}
```

- [ ] **Step 6: Run the focused tests and then the complete Node suite.**

Run: `node --test editor-state.test.mjs`

Expected: PASS with all existing and new tests.

- [ ] **Step 7: Commit the tested state migration.**

This workspace has no `.git` directory, so do not fabricate a commit. If implementation runs in a Git worktree, run:

```bash
git add editor-state.mjs editor-state.test.mjs
git commit -m "feat: support board format migration"
```

### Task 2: Add the board-format controls to the board workspace

**Files:**
- Modify: `index.html:79-92`
- Modify: `styles.css` (near `.inspector-content` and workspace content rules)

**Interfaces:**
- Consumes: current board metadata rendered by `app.mjs`.
- Produces: DOM controls `#board-format-select`, `#apply-board-format-button`, and status text `#board-format-help`.

- [ ] **Step 1: Add the format control markup below the existing board metadata.**

```html
<div class="board-format-control">
  <label for="board-format-select">棋盘格式</label>
  <div class="board-format-row">
    <select id="board-format-select" class="compact-control" aria-describedby="board-format-help">
      <option value="4">4 × 4</option>
      <option value="5">5 × 5</option>
      <option value="6">6 × 6</option>
    </select>
    <button id="apply-board-format-button" class="primary-action small-action" type="button" disabled>应用格式</button>
  </div>
  <p id="board-format-help">会重新分配全部切片到目标列；图片和切片不会删除。</p>
</div>
```

- [ ] **Step 2: Add styles for the compact control, help copy, and disabled state.**

```css
.board-format-control { display: grid; gap: 6px; margin-top: 14px; border-top: 1px solid #334155; padding-top: 12px; }
.board-format-control > label { color: #cbd5e1; font-size: 11px; font-weight: 700; }
.board-format-row { display: flex; gap: 6px; align-items: center; }
.board-format-row select { flex: 1; }
.board-format-row .primary-action { flex: 0 0 auto; }
.board-format-row .primary-action:disabled { border: 1px solid #334155; background: #1e293b; color: #64748b; cursor: default; opacity: .8; }
.board-format-control p { margin: 0; color: #94a3b8; font-size: 10px; line-height: 1.45; }
```

- [ ] **Step 3: Verify the controls render without changing existing layout.**

Run: `node --test editor-state.test.mjs`

Expected: PASS; manually open the editor and confirm the controls appear only in the board workspace.

- [ ] **Step 4: Commit the board workspace markup and styles.**

This workspace has no `.git` directory, so do not fabricate a commit. If implementation runs in a Git worktree, run:

```bash
git add index.html styles.css
git commit -m "feat: add board format controls"
```

### Task 3: Wire format selection, migration, and all preview refreshes

**Files:**
- Modify: `app.mjs:1-30, 68-78, 130-146, 871-884, 936-978`

**Interfaces:**
- Consumes: `changeBoardFormat`, the three new board-format DOM elements, `activeLayout`, `activePreview`.
- Produces: confirmed format changes that update every existing preview and publish the new layout to WebGL.

- [ ] **Step 1: Import the pure function and cache the three DOM elements.**

Add `changeBoardFormat` to the import list, then add:

```js
const boardFormatSelect = document.querySelector('#board-format-select');
const applyBoardFormatButton = document.querySelector('#apply-board-format-button');
const boardFormatHelp = document.querySelector('#board-format-help');
```

- [ ] **Step 2: Keep the selector and button state synchronized without overwriting a pending selection.**

Add one helper and invoke it from `renderShell()` with the default `resetSelection: false`:

```js
function renderBoardFormatControls(currentBoardSize = Number(activePreview?.gridSize) || 4, { resetSelection = false } = {}) {
  if (resetSelection || !['4', '5', '6'].includes(boardFormatSelect.value)) {
    boardFormatSelect.value = String(currentBoardSize);
  }
  if (resetSelection) {
    boardFormatHelp.textContent = '会重新分配全部切片到目标列；图片和切片不会删除。';
  }
  applyBoardFormatButton.disabled = activeLayout == null || Number(boardFormatSelect.value) === currentBoardSize;
}
```

Register a `change` listener that calls `renderBoardFormatControls()` only. It must not mutate `activeLayout` and must not call code that resets `boardFormatSelect.value` to the current board size.

- [ ] **Step 3: Make `renderMetadata()` reset the control only after a layout is loaded or committed.**

At the end of `renderMetadata(layout, preview)`, call:

```js
renderBoardFormatControls(preview.gridSize, { resetSelection: true });
```

This resets the control when a level load or successful format change calls `renderMetadata()`, while the `change` handler from Step 2 preserves the pending target size before confirmation.

- [ ] **Step 4: Implement the confirmed apply handler.**

```js
function applySelectedBoardFormat() {
  if (activeLayout == null || activePreview == null) return;
  const targetSize = Number(boardFormatSelect.value);
  const currentSize = activePreview.gridSize;
  if (targetSize === currentSize) return;
  if (!window.confirm(`确定将棋盘从 ${currentSize} × ${currentSize} 改为 ${targetSize} × ${targetSize}？\n会重新分配全部切片，图片和切片不会删除。`)) return;

  const result = changeBoardFormat(activeLayout, targetSize);
  if (!result.changed) {
    boardFormatHelp.textContent = result.reason === 'insufficient-tiles'
      ? `切片不足，无法填满 ${targetSize} × ${targetSize} 开局棋盘。`
      : '当前关卡结构不支持该棋盘格式。';
    renderBoardFormatControls(currentSize);
    return;
  }

  activeLayout = result.layout;
  activePreview = createLevelPreview(activeLayout);
  selectedProjectPicture = null;
  state = { ...state, selectedPictureIndex: null, selectedSceneTileSlot: null };
  renderPreview(activeLayout, activePreview);
  renderPictureLibrary(activeLayout, activePreview);
  renderMetadata(activeLayout, activePreview);
  publishActivePreview(true);
  boardFormatHelp.textContent = `已切换为 ${targetSize} × ${targetSize}；全部切片已重新分配到 ${targetSize} 列。`;
  renderShell();
}
```

- [ ] **Step 5: Register the apply listener and ensure load/switch paths reset the selector.**

Add `applyBoardFormatButton.addEventListener('click', applySelectedBoardFormat);`. Keep the existing `loadSelectedLevel()` sequence; its `renderMetadata()` and `renderShell()` calls must restore the loaded board size and clear any pending selection. Do not mutate the source level pack object outside `activeLayout` copy-on-write changes.

- [ ] **Step 6: Exercise the handler manually and run all existing tests.**

Run: `node --test editor-state.test.mjs editor-launcher.test.mjs webgl-preview-bridge.test.mjs`

Expected: PASS. In the browser, load a 4×4 level with at least 25 tiles, select 5×5, confirm, and verify the editor board, queues, metadata, and running preview all show 5×5.

- [ ] **Step 7: Commit the event wiring.**

This workspace has no `.git` directory, so do not fabricate a commit. If implementation runs in a Git worktree, run:

```bash
git add app.mjs
git commit -m "feat: apply board format changes"
```

### Task 4: Verify edge cases and regression behavior

**Files:**
- Modify: `editor-state.test.mjs` only if a discovered regression needs a focused test; otherwise no code changes.

**Interfaces:**
- Consumes: completed migration function and UI wiring.
- Produces: evidence that supported levels, insufficient levels, preview generation, and WebGL publishing remain valid.

- [ ] **Step 1: Run the complete automated suite.**

Run: `node --test editor-state.test.mjs editor-launcher.test.mjs webgl-preview-bridge.test.mjs`

Expected: all tests PASS.

- [ ] **Step 2: Manually verify the supported-level matrix.**

Check level 1 (4×4, insufficient for 6×6) can switch to 5×5 but rejects 6×6; check level 9 (5×5) can switch to 4×4 and 6×6 only if it has at least 36 tiles; check level 21 (6×6) can switch to 4×4 and 5×5. For each successful change verify queue count equals the target size, the validation summary is valid, and no image is missing.

- [ ] **Step 3: Verify cancellation and no-op behavior.**

Open the confirmation dialog and cancel; assert the board and metadata remain unchanged. Select the current size; assert the apply button is disabled and no confirmation appears.

- [ ] **Step 4: Verify live WebGL synchronization.**

Start “试玩当前关卡”, change from 4×4 to 5×5 or from 5×5 to 6×6 on a level with enough tiles, and confirm the WebGL frame receives the updated layout without a page reload.

- [ ] **Step 5: Commit any regression test added during verification.**

This workspace has no `.git` directory, so do not fabricate a commit. If implementation runs in a Git worktree and Task 4 added a test, run:

```bash
git add editor-state.test.mjs
git commit -m "test: cover board format regressions"
```

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-23-board-format-switching-plan.md`. Execute it task-by-task with the executing-plans skill, checking off each step and running the stated tests at every checkpoint.
