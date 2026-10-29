# Adaptive Level Scene Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editor and runtime level scenes automatically fit each level's board and pending queue inside their phone canvases.

**Architecture:** Add a pure `calculateSceneLayout` helper in `editor-state.mjs`. `app.mjs` derives pending queue lengths from the existing preview and writes the helper's measurements as CSS variables on each phone composition. `styles.css` consumes those variables while preserving expanded editor queues and overlapped runtime queues.

**Tech Stack:** Browser ES modules, CSS custom properties, Node's built-in test runner.

## Global Constraints

- Do not mutate level data or queue order.
- Editor queues remain fully expanded; runtime queues remain overlapped.
- Board columns and queue columns remain aligned.
- All layout values stay finite and non-negative and fit the requested phone content box.

### Task 1: Add the pure layout contract and failing tests

**Files:**
- Modify: `editor-state.test.mjs`
- Modify: `editor-state.mjs`

**Interfaces:**
- Produces `calculateSceneLayout({ gridSize, tilePixelSize, queueLengths, containerWidth, containerHeight, mode })` returning `{ scale, boardWidth, boardHeight, tileWidth, tileHeight, queueHeight, totalHeight, queueGap }`.

- [x] **Step 1: Write the failing test**

Add tests for 4x4, 5x5, and 6x6 editor layouts with pending queue lengths, asserting `totalHeight <= containerHeight`, `boardWidth <= containerWidth`, and `boardWidth === tileWidth * gridSize` within floating-point tolerance. Add a runtime test asserting runtime overlap produces a shorter queue height than the expanded editor layout for the same inputs.

- [x] **Step 2: Run the focused tests and verify failure**

Run `node --test editor-state.test.mjs`. Expected: failures because `calculateSceneLayout` is not exported.

- [x] **Step 3: Implement the minimal pure calculation**

Normalize invalid numbers to safe defaults, derive the aspect ratio from `tilePixelSize`, reserve queue and board gaps, calculate the largest tile width that fits both width and height, and use a reduced effective queue step for `mode === 'runtime'`.

- [x] **Step 4: Run the focused tests and verify pass**

Run `node --test editor-state.test.mjs`; expected all tests pass.

### Task 2: Connect calculated measurements to rendering

**Files:**
- Modify: `app.mjs`

**Interfaces:**
- Consumes `calculateSceneLayout` and the existing `createLevelPreview` output.
- Produces CSS variables on `#phone-composition` and `#runtime-phone` for board size, tile size, queue gap, and total content height.

- [x] **Step 1: Import the helper and add composition references**

Import `calculateSceneLayout`; query the editor and runtime phone elements.

- [x] **Step 2: Add a layout application helper**

Compute pending queue lengths from `preview.queueStackTiles`, call the pure helper with each phone's inner dimensions, and set `--scene-board-width`, `--scene-board-height`, `--scene-tile-width`, `--scene-tile-height`, `--scene-queue-gap`, and `--scene-content-height`.

- [x] **Step 3: Apply both layouts during preview rendering**

Call the helper before rendering boards and queues so every level change and picture swap recalculates the scene.

- [x] **Step 4: Run existing tests**

Run `node --test`; expected all tests pass because DOM wiring is not exercised by Node tests.

### Task 3: Replace fixed CSS dimensions with variables

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

- [x] **Step 1: Add stable hooks to the two phone compositions**

Ensure the editor phone has `id="phone-composition"` and runtime phone has `id="runtime-phone"`.

- [x] **Step 2: Use custom properties for board, queues, and spacing**

Replace fixed board/queue widths and margins with the calculated variables. Keep editor queue tile margins at zero and runtime queue tile overlap driven by its existing overlap rule scaled from `--scene-tile-height`.

- [x] **Step 3: Keep content centered without overflow**

Use a fixed inner phone content box with `overflow: hidden`; place queue, board, and caption using the calculated total height and a centered block so the full layout stays within the phone border.

- [x] **Step 4: Run tests and inspect styles for stale fixed assumptions**

Run `node --test` and search `styles.css` for old fixed `145px`, `156px`, `125px`, and hard-coded queue margins that would override the variables.

### Task 4: Browser verification across representative levels

**Files:** none.

- [x] **Step 1: Start the local editor server**

Run `./启动拼图素材编辑器.command --port 4173 --no-open`.

- [x] **Step 2: Inspect representative levels**

Open levels 1, 15, 21, 24, 27, and 30. Confirm the complete expanded editor queues fit, runtime queues remain overlapped, board and queue columns align, and no phone content clips vertically.

- [x] **Step 3: Check browser errors**

Confirm there are no console errors and that switching levels and swapping pictures recomputes layout without changing queue order.
