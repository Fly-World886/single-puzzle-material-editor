# WebGL Victory and Preview Isolation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the standalone WebGL game reliably complete a valid puzzle, show victory, and advance to the next level while keeping editor playtests temporary and isolated to the selected level.

**Architecture:** Reproduce the standalone build first, trace the completion event from puzzle resolution through the outcome view, and add focused regression coverage at the model/command boundary. Keep preview overrides in the existing `PreviewLevelStore`, but give preview sessions an explicit next-level policy so the edited level is temporary and the next level comes from the normal pack without persisting editor state. Rebuild WebGL from the editor Unity project and verify the exported artifact in a browser.

**Tech Stack:** Unity 2022.3 C#, QFramework, NUnit EditMode tests, Unity WebGL, native browser editor with Node tests.

## Global Constraints

- Do not edit generated WebGL binaries by hand; rebuild them from `/Users/fsf/Desktop/JigsawDown-IOSMaster-Editor`.
- Preview configuration must not write `PlayerPrefs`, Resources, YooAsset, or the source level pack.
- Preserve unrelated worktree changes in both projects.
- Use a failing test before production changes where the behavior is testable.

---

### Task 1: Reproduce and characterize standalone victory

**Files:**
- Test: `Assets/Art/Tests/Editor/Features/Puzzle/Level/*` existing puzzle model/command tests
- Modify: only the smallest production seam identified after the failing test

- [ ] **Step 1: Reproduce the standalone flow in the browser.** Open `/game/`, enter Level 1, and record whether the board accepts moves, whether completed images are removed, and whether the success event/page appears.
- [ ] **Step 2: Run focused Unity EditMode tests before changing code.** Use the existing puzzle model and command test filters; capture the first failing assertion or compile/runtime error.
- [ ] **Step 3: Add one regression test for the observed broken boundary.** The test must assert an observable outcome: a valid final puzzle marks `IsCompleted`, or a completed model causes `PuzzleOutcomeChangedEvent(true, false)` through the real command path.
- [ ] **Step 4: Run the new test and verify it fails for the current implementation.** Do not proceed from a passing test.

### Task 2: Fix the victory and next-level state flow

**Files:**
- Modify: `Assets/Art/Runtime/Features/Puzzle/Models/PuzzleModel.cs` or the specific completion command identified by Task 1
- Modify: `Assets/Art/Runtime/Features/Puzzle/Presentation/Board/PuzzleBoardController.cs`
- Modify: `Assets/Art/Runtime/Features/Puzzle/Presentation/Outcome/PuzzleOutcomeView.cs`
- Modify: `Assets/Art/Runtime/Features/Puzzle/Level/Commands/AdvancePuzzleLevelProgressCommand.cs` only if preview/non-preview progression is the failing boundary
- Test: focused regression test from Task 1

- [ ] **Step 1: Implement the minimal root-cause fix.** Keep the existing sequence `resolve -> model completion -> outcome event -> continue`; do not bypass normal victory handling.
- [ ] **Step 2: Add explicit preview-session behavior if needed.** Preview completion may show victory and load the next normal level, but must not save the preview level or its edited layout as persistent progress.
- [ ] **Step 3: Run the focused test and all existing puzzle tests.** Confirm the regression is green and no existing completion tests regress.

### Task 3: Harden WebGL bridge and generated HTML

**Files:**
- Modify: `Assets/Art/Editor/Build/WebGLPreviewBuildPostprocessor.cs`
- Modify: `JigsawDown/index.html` only through a fresh build
- Test: existing build postprocessor tests or add `Assets/Art/Tests/Editor/Build/WebGLPreviewBuildPostprocessorTests.cs` if absent

- [ ] **Step 1: Add a failing idempotence test for the injected bridge.** Calling `Inject` on already injected HTML must leave one ready hook and one message listener.
- [ ] **Step 2: Run the test and verify it fails against the current duplicate-ready injection.**
- [ ] **Step 3: Fix injection to store the Unity instance once and send one ready notification.** Keep same-origin/source checks and both preview message types.
- [ ] **Step 4: Run the build postprocessor tests.**

### Task 4: Preserve temporary preview configuration and advance normally

**Files:**
- Modify: `Assets/Art/Runtime/Features/Puzzle/Preview/JigsawPreviewBridge.cs`
- Modify: `Assets/Art/Runtime/Features/Puzzle/Preview/PreviewLevelStore.cs`
- Modify: `Assets/Art/Runtime/Features/Puzzle/Presentation/Board/PuzzleBoardController.cs`
- Modify: `Assets/Art/Runtime/Features/Puzzle/Level/Models/PuzzleLevelModel.cs` if next-level bounds need a session override
- Test: `Assets/Art/Tests/Editor/Features/Puzzle/Preview/JigsawPreviewBridgeTests.cs`

- [ ] **Step 1: Add failing tests.** Assert preview loading does not change stored current level, completion does not replace the preview payload with persistent content, and opening the next level resolves to the normal pack rather than the edited preview layout.
- [ ] **Step 2: Run focused preview tests and verify failure.**
- [ ] **Step 3: Implement the smallest session flag/store policy.** Retain the edited config only for its level; clear or bypass it when moving to the next normal level; never call persistent progress writes for the preview session.
- [ ] **Step 4: Run preview and level regression tests.**

### Task 5: Rebuild and browser-verify the complete flow

**Files:**
- Modify generated output by build only: `/Users/fsf/Desktop/拼图素材编辑器/JigsawDown`
- No hand edits to compressed build files

- [ ] **Step 1: Run the full Node test suite and Unity focused tests.**
- [ ] **Step 2: Build WebGL with `WebGLBuildAutomation.Build`.** Confirm exit code 0 and inspect the build log for errors.
- [ ] **Step 3: Start the local editor server and verify `/game/` loads without WebGL runtime errors.**
- [ ] **Step 4: Complete a standalone level and verify the success page and next-level board.**
- [ ] **Step 5: From the editor, start playtest, apply a changed current-level configuration, complete it, verify victory and next-level transition, then reload the editor and confirm the edited layout was not persisted.
