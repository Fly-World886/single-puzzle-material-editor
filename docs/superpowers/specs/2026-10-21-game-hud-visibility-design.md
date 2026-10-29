# Game HUD Visibility Design

## Goal

The editor HUD control hides or shows the game's HUD in both the operation preview and demo window.

## Scope

When hidden, the game level indicator, countdown, pause button, and bottom item controls are hidden. The game board and background remain visible. The editor's operation and demo game instances stay in the same visibility state, including when the demo window opens after the setting changes.

## Approach

Keep the existing editor state and button as the single source of truth. Extend the Seamscape preview bridge/runtime communication to publish the HUD visibility value to both game instances. The web runtime calls `SeamscapePreviewBridge.SetHudVisible` in Unity. The current static runtime preview reflects the same setting.

## Repository Boundary

The workspace contains only the compiled Unity WebGL player and does not contain the `SeamscapePreviewBridge` C# source or a compiled `SetHudVisible` method. The JavaScript protocol is implemented, but the actual game HUD cannot respond until the Unity project implements `SetHudVisible` to toggle the level indicator, timer, pause control, and bottom item controls together. The current compiled build does not expose this method.

## Validation

Add focused tests for bridge synchronization and runtime state application. Run the existing Node test suite and verify both preview instances receive the same visibility state.
