# Scene Pan, Zoom, and External Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all pending queues above each phone without clipping, and add mouse pan/zoom controls to the editable scene canvas.

**Architecture:** Use the existing scene-composition wrappers as vertically stacked queue-and-phone units. Add pure viewport reducers to `editor-state.mjs`; `app.mjs` applies the resulting CSS transform and manages pointer/wheel events for the editor canvas only. CSS gives the composition normal child flow while phones independently arrange HUD, board, and caption.

**Tech Stack:** Browser ES modules, Pointer Events, CSS custom properties, Node built-in test runner.

## Global Constraints

- The phone interior contains only HUD, background, and board; no queue markup is a phone descendant.
- External queues are directly above their matching phone, share the exact board width and column grid, and do not clip behind the phone frame.
- Editor queues remain expanded; runtime queues remain overlapped.
- Left-button drag begins only from non-interactive editor-canvas space; tile click/select/swap behavior remains unchanged.
- Wheel zoom is centered at the pointer, clamped to 0.5–2.0, and applies to the editor canvas only.
- Do not mutate level data, tile order, resources, or runtime preview interactions.

---

### Task 1: Add pure editable-scene viewport state

**Files:**
- Modify: `editor-state.mjs`
- Modify: `editor-state.test.mjs`

**Interfaces:**
- Produces `createSceneViewport()` returning `{ x: 0, y: 0, zoom: 1 }`.
- Produces `panSceneViewport(viewport, deltaX, deltaY)`.
- Produces `zoomSceneViewportAtPoint(viewport, factor, pointX, pointY)` where the point is in canvas-local coordinates.

- [ ] **Step 1: Write failing viewport tests**

Add tests for the initial viewport, pan accumulation, zoom clamping, and pointer-centered zoom.

```js
assert.deepEqual(createSceneViewport(), { x: 0, y: 0, zoom: 1 });
assert.equal(zoomSceneViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 10, 100, 80).zoom, 2);
assert.deepEqual(zoomSceneViewportAtPoint({ x: 0, y: 0, zoom: 1 }, 2, 100, 80), { x: -100, y: -80, zoom: 2 });
```

- [ ] **Step 2: Verify the focused tests fail**

Run: `node --test editor-state.test.mjs`

Expected: import/export failure for the new helpers.

- [ ] **Step 3: Implement minimal viewport helpers**

Normalize every numeric input to a finite value. Clamp zoom to `[0.5, 2]`. For anchored zoom use `nextOffset = point - (point - oldOffset) * (nextZoom / oldZoom)`.

- [ ] **Step 4: Verify focused tests pass**

Run: `node --test editor-state.test.mjs`

Expected: all focused tests pass.

### Task 2: Make queue-phone compositions flow correctly

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes existing wrapper variables `--scene-composition-width`, `--scene-composition-height`, queue variables `--external-*`, and phone board variables `--scene-board-*`.
- Produces centered queue-above-phone compositions in editor and runtime stages.

- [ ] **Step 1: Replace internal absolute composition rules**

Define `.scene-composition` as absolute, vertically stacked, and centered in its stage with `width: var(--scene-composition-width)` and `height: var(--scene-composition-height)`. Position phone children normally within the stack.

- [ ] **Step 2: Make queues regular composition children**

Remove queue `top`, `left`, and transform rules. Use `width: var(--external-queue-width)`, `height: var(--external-queue-height)`, and the existing grid column count. Use `--external-tile-height` and `--external-queue-step` for tile dimensions/margins.

- [ ] **Step 3: Keep phone gameplay self-contained**

Remove queue references from `.puzzle-board`, `.runtime-board`, and `.runtime-caption`. Position boards below their HUDs within the 210×380 editor phone and 180×360 runtime phone; keep runtime caption relative to its phone.

- [ ] **Step 4: Verify static layout constraints**

Run `node --test`, then `rg -n 'scene-content-top|scene-queue-height|scene-queue-gap' styles.css app.mjs`.

Expected: all tests pass; deprecated internal-queue variables do not occur.

### Task 3: Wire editor canvas pan and wheel zoom

**Files:**
- Modify: `index.html`
- Modify: `app.mjs`

**Interfaces:**
- Consumes viewport helpers and `#scene-canvas`, `#scene-composition`, and `#zoom-control` IDs.
- Produces pointer dragging and wheel zoom that update scene-composition CSS `--viewport-x`, `--viewport-y`, and `--viewport-zoom`.

- [ ] **Step 1: Add stable DOM hooks**

Set `id="scene-canvas"` on the editor canvas and `id="zoom-control"` on the zoom display.

- [ ] **Step 2: Initialize and render viewport state**

Import the three viewport helpers. Keep a local viewport value initialized with `createSceneViewport()`. Render CSS values on `#scene-composition` and render the rounded percentage in `#zoom-control`.

- [ ] **Step 3: Add safe pointer drag handlers**

On primary-button `pointerdown`, skip if `event.target.closest('button, select, input, a')` is present. Otherwise capture the pointer, store the pointer coordinates, and add a dragging class. On move, call `panSceneViewport` with successive coordinate deltas. On up/cancel, clear the drag state and class.

- [ ] **Step 4: Add anchored wheel zoom**

Use a non-passive wheel listener. Call `preventDefault`, derive local pointer coordinates from `sceneCanvas.getBoundingClientRect()`, use factor `1.1` for negative `deltaY` and `1 / 1.1` otherwise, and call `zoomSceneViewportAtPoint`.

- [ ] **Step 5: Run all tests**

Run: `node --test && node --check app.mjs`

Expected: all tests pass and app syntax is valid.

### Task 4: Browser validation

**Files:** none.

- [ ] **Step 1: Open local editor**

Run: `./启动拼图素材编辑器.command --port 4173 --no-open`

- [ ] **Step 2: Check representative levels**

Switch to levels 1, 15, 21, 24, 27, and 30. Assert each external queue rectangle is above its phone, all queue tiles lie outside the phone rectangle, and queue/board widths match.

- [ ] **Step 3: Check editor controls**

On the editor canvas, drag a blank point with the left button and confirm the composition moves. Wheel at a visible point and confirm the displayed percentage changes while the canvas does not scroll. Click a board tile and confirm tile preselection still works without panning.

- [ ] **Step 4: Check runtime and console**

Verify runtime composition does not move or scale while using editor interactions. Confirm the browser console has no errors.
