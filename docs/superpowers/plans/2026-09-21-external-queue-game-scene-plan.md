# External Queue Game Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all pending drop queues above each phone while keeping the phone interior identical to the game scene.

**Architecture:** Wrap each phone and its associated queue in a scene composition. Calculate the board from the fixed phone gameplay area, calculate the queue independently from the external space, and place both with the same board width. The editor continues to expand queue tiles; the runtime preview retains the overlapping stack.

**Tech Stack:** Browser ES modules, CSS custom properties, Node built-in test runner.

## Global Constraints

- Never mutate level data, tile resources, tile order, or existing swap behavior.
- Phone interiors contain only HUD, background, and board; no queue markup may be a phone descendant.
- External queues are directly above their phone and share the board's exact width and column grid.
- Editor queues are expanded; runtime queues overlap.
- 4×4, 5×5, and 6×6 boards and every supported queue length fit the surrounding stage without overlapping UI controls.

---

### Task 1: Define independent board and external queue measurements

**Files:**
- Modify: `editor-state.test.mjs`
- Modify: `editor-state.mjs`

**Interfaces:**
- Consumes: `calculateSceneLayout(input)`.
- Produces: `calculateExternalQueueLayout({ gridSize, tilePixelSize, queueLengths, boardWidth, queueHeight, mode })` returning `{ tileWidth, tileHeight, queueHeight, queueTileStep, boardWidth, compositionHeight }`.

- [ ] **Step 1: Write a failing board-stability test**

Add a test that invokes `calculateSceneLayout` twice with the same 6×6 board but distinct queue lengths, then asserts both `boardWidth` and `boardHeight` are equal.

```js
assert.equal(shortQueue.boardWidth, longQueue.boardWidth);
assert.equal(shortQueue.boardHeight, longQueue.boardHeight);
```

- [ ] **Step 2: Run the focused test and confirm the existing coupled layout fails it**

Run: `node --test editor-state.test.mjs`

Expected: failure showing the long queue currently reduces board width or height.

- [ ] **Step 3: Make board calculation queue-independent**

Change `calculateSceneLayout` to derive tile and board dimensions only from `gridSize`, `tilePixelSize`, `containerWidth`, and `containerHeight`; it must return the existing board fields and omit queue influence.

```js
const boardTileWidth = Math.min(width / columns, height / (columns / tileAspect));
```

- [ ] **Step 4: Add a failing external queue test**

Import `calculateExternalQueueLayout`. For a six-column 180×260 tile layout with four pending tiles, assert the returned `boardWidth` remains the supplied value, `queueHeight` fits the supplied external height, and editor `queueTileStep === tileHeight`.

- [ ] **Step 5: Implement external queue calculation and verify all state tests pass**

Use `boardWidth / gridSize` for tile width. Calculate expanded editor queue height from full tile heights; calculate runtime height using one-sixth-width steps. Return a finite composition height equal to `queueHeight + queueGap + phoneHeight`.

Run: `node --test editor-state.test.mjs`

Expected: all tests pass.

### Task 2: Separate the DOM composition from the phone DOM

**Files:**
- Modify: `index.html:25-52`
- Modify: `app.mjs:14-180`

**Interfaces:**
- Consumes: `calculateSceneLayout`, `calculateExternalQueueLayout`, and the existing `preview.queueStackTiles`.
- Produces: `#scene-composition` and `#runtime-composition`; their queue elements are siblings of `#phone-composition` and `#runtime-phone`.

- [ ] **Step 1: Add scene composition wrappers**

Restructure the editor markup to place `#queue-columns` before `#phone-composition` inside `#scene-composition`. Restructure the runtime markup identically with `#runtime-queue-columns` before `#runtime-phone` inside `#runtime-composition`.

```html
<div id="scene-composition" class="scene-composition">
  <div id="queue-columns" class="queue-columns"></div>
  <div id="phone-composition" class="phone-composition">…HUD and board…</div>
</div>
```

- [ ] **Step 2: Query the two wrappers**

In `app.mjs`, query the new wrapper IDs and keep the existing queue and phone references.

- [ ] **Step 3: Apply independent board and queue variables**

Replace `applySceneLayout` with a helper that calculates phone-board layout and external queue layout. Set board measurements on the phone; set external queue width, height, tile height, and step on the wrapper or queue element. Apply the same `--scene-board-width` to both.

- [ ] **Step 4: Re-render on all existing paths**

Keep the composition helper inside `renderPreview`, before board and queue DOM replacement, so loading a level and swapping a scene tile recompute both regions.

- [ ] **Step 5: Run all Node tests**

Run: `node --test`

Expected: all tests pass.

### Task 3: Position the external queue above the phone

**Files:**
- Modify: `styles.css:17-95`

**Interfaces:**
- Consumes: `--scene-board-width`, `--scene-board-height`, `--external-queue-height`, `--external-tile-height`, and `--external-queue-step`.
- Produces: visually aligned, external queue/phone compositions centered in each stage.

- [ ] **Step 1: Introduce composition positioning**

Create `.scene-composition` as an absolutely centered column with an explicit calculated width. Remove `top`, `left`, and transform positioning from phone containers because their parent now positions the pair.

- [ ] **Step 2: Make the external queues normal composition children**

Remove absolute queue coordinates. Give `.queue-columns` the exact board width and its calculated height. Keep the bottom-aligned flex columns so the next drop remains closest to the phone.

- [ ] **Step 3: Restore phone-only game framing**

Place the HUD and board within each phone. Vertically center the board within its stable gameplay area; do not reference queue CSS variables from `.puzzle-board` or `.runtime-board` rules.

- [ ] **Step 4: Preserve editor/runtime stacking differences**

Use the supplied external queue step for tile margins: editor step equals a full tile height; runtime is shorter than tile height. Do not change DOM order or tile rendering.

- [ ] **Step 5: Run tests and search for stale nesting dependencies**

Run: `node --test`

Then run: `rg -n 'scene-content-top|scene-queue-height|scene-queue-gap' styles.css app.mjs`

Expected: no old phone-internal queue positioning remains.

### Task 4: Verify representative layouts in the browser

**Files:** none.

- [ ] **Step 1: Start the local server**

Run: `./启动拼图素材编辑器.command --port 4173 --no-open`

- [ ] **Step 2: Inspect all representative board sizes**

Switch to levels 1, 15, 21, 24, 27, and 30. For each, verify every queue rectangle is above rather than inside the phone; verify the phone rectangle contains neither queue labels nor queue tiles; verify queue and board widths match.

- [ ] **Step 3: Check editor/runtime stack behavior and errors**

At level 21, compare the vertical distance between adjacent tiles in both queues: editor must be at least a full tile height, runtime must be smaller. Confirm browser console has no errors.

- [ ] **Step 4: Check all source levels mathematically**

Read the local level pack and call both layout functions for all 30 enabled levels. Assert each returned dimension is finite and the external composition width/height fits the designated stage bounds.
