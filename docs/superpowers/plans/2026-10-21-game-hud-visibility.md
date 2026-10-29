# Game HUD Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing HUD control hide or show the game HUD in both Seamscape preview windows.

**Architecture:** Keep `previewHudVisible` as editor state and extend the preview bridge/runtime message path to carry it. Apply the state to both connected game instances, and keep editor static previews in sync.

**Tech Stack:** Browser JavaScript modules, Unity WebGL bridge, Node built-in tests.

## Global Constraints

- Hide the level indicator, countdown, pause button, and bottom item controls together.
- Keep the board and background visible.
- Keep the operation preview and demo window synchronized.

---

### Task 1: Extend game preview HUD synchronization

**Files:**
- Modify: `app.mjs`
- Modify: `seamscape-preview.mjs`
- Modify: `Seamscape-WebGL/TemplateData/seamscape-webgl-runtime.mjs`
- Test: `seamscape-preview.test.mjs`
- Test: `seamscape-webgl-runtime.test.mjs`

- [ ] Add tests proving HUD visibility is sent to both preview instances and applied when the runtime receives a visibility update.
- [ ] Extend bridge messages and the WebGL runtime to apply the visibility state to the game's HUD group.
- [ ] Wire the editor toggle state into bridge synchronization and the static preview.
- [ ] Run `node --test` and inspect the resulting diff.
