# 草稿保存工具栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除三个未实现的工具栏按钮，并实现按关卡保存、恢复布局和游戏背景的本地草稿功能。

**Architecture:** Python 启动器提供独立的 `/api/level-drafts` 接口，把通过白名单验证的草稿原子写入 `resources/drafts/level_0001.json`。浏览器端通过 `editor-state.mjs` 的纯函数构造和验证草稿载荷，`app.mjs` 负责按钮状态、`⌘S`、草稿优先加载和既有预览刷新链。

**Tech Stack:** 原生 HTML/CSS、ES modules、Node built-in test runner、Python `http.server` 启动器。

## Global Constraints

- 工具栏最终只保留一个可用操作：`保存草稿`；不实现新建、复制、关卡素材导入、校验导出、撤销或重做。
- 不覆盖 `resources/levels/main/levels_0001_0030.json` 原始关卡包。
- 草稿只写入 `resources/drafts/level_<四位关卡号>.json`；客户端不得传入文件路径。
- 草稿必须保存完整 `activeLayout` 和当前 `selectedGameBackground`，未选背景写入 `null`。
- 服务端仅接受 `levelId` 为 1–30，正方形 `boardSize` 为 4、5 或 6，且 `queues`、`pictures` 为数组。
- 草稿写入使用临时文件加 `os.replace()`；失败时保留旧草稿。
- 无草稿或无效草稿时必须回退原始关卡，不阻止编辑器使用。
- 当前工作区没有 `.git`；不要初始化仓库或伪造提交。若实施环境有 Git，再按任务中的提交命令提交。

---

### Task 1: Remove unused toolbar actions and add draft payload helpers

**Files:**
- Modify: `index.html:15-22`
- Modify: `editor-state.mjs` (add helpers beside other exported state utilities)
- Modify: `editor-state.test.mjs` (import and test the helpers)

**Interfaces:**
- Produces: `createDraftPayload(levelId, layout, selectedGameBackground)` returning a detached `{ version: 1, levelId, layout, selectedGameBackground }` or `null` for a non-positive integer level id or non-object layout.
- Produces: `getUsableDraft(draft, expectedLevelId)` returning the same valid draft object or `null` when its version, level id, layout shape, supported square board size, queue array, picture array, or background shape is invalid.
- Consumes later: `app.mjs` uses both helpers before saving and after loading from `/api/level-drafts`.

- [ ] **Step 1: Replace toolbar markup with the sole save control and truthful shortcut copy.**

Replace the current four buttons and shortcut text with exactly:

```html
<div class="toolbar-actions">
  <button id="save-draft-button" class="secondary-action" type="button" disabled>保存草稿</button>
</div>
<div class="shortcut-help">⌘S 保存草稿<br>鼠标右键拖动画布<br>H 隐藏编辑 UI</div>
```

- [ ] **Step 2: Add failing pure-function tests.**

Add `createDraftPayload` and `getUsableDraft` to the named imports in `editor-state.test.mjs`, then add:

```js
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
});
```

- [ ] **Step 3: Verify the new tests fail because the helpers are not exported.**

Run: `node --test --test-name-pattern='creates a detached|accepts only a matching' editor-state.test.mjs`

Expected: FAIL with a missing named export error for `createDraftPayload` and/or `getUsableDraft`.

- [ ] **Step 4: Implement the two pure helpers.**

Add the following definitions to `editor-state.mjs`:

```js
const SupportedBoardSizes = new Set([4, 5, 6]);

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
      !SupportedBoardSizes.has(width) || width !== height || !Array.isArray(layout?.queues) ||
      !Array.isArray(layout?.pictures) || !isSafeDraftBackground(draft?.selectedGameBackground)) return null;
  return draft;
}
```

If `SupportedBoardSizes` already exists from board-format work, keep exactly one declaration and reuse it; do not duplicate it.

- [ ] **Step 5: Run focused and full state tests.**

Run: `node --test editor-state.test.mjs`

Expected: PASS, including the two new tests and all pre-existing state tests.

- [ ] **Step 6: Commit when Git is available.**

```bash
git add index.html editor-state.mjs editor-state.test.mjs
git commit -m "feat: prepare draft save toolbar"
```

Do not run this command in the current non-Git workspace.

### Task 2: Add the validated, atomic local draft API

**Files:**
- Modify: `启动拼图素材编辑器.command:58-69,95-225`
- Modify: `editor-launcher.test.mjs:1-124`
- Create at runtime only: `resources/drafts/level_0001.json` (test cleanup must remove its exact file)

**Interfaces:**
- Produces: `GET /api/level-drafts?levelId=<1..30>` → `{ draft: object | null }` with `200`, or a `400` JSON error for an invalid id.
- Produces: `POST /api/level-drafts` with `{ levelId, layout, selectedGameBackground }` → `{ draft }` with `200`, `400` for validation errors, and `500` for filesystem failures.
- Consumes from Task 1: version-1 draft format and supported board sizes 4, 5, 6.

- [ ] **Step 1: Add failing launcher tests for round-trip persistence and rejection.**

At the top of `editor-launcher.test.mjs`, import exact-path cleanup utilities:

```js
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
```

Add this successful round-trip test. Its `context.after` targets only the one generated draft file:

```js
test('launcher saves and restores a level draft with its game background', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  const levelId = 1;
  const draftPath = join(editorDirectory, 'resources', 'drafts', 'level_0001.json');
  context.after(async () => {
    await rm(draftPath, { force: true });
    launcher.kill('SIGTERM');
  });
  const body = {
    levelId,
    layout: {
      boardSize: { width: 5, height: 5 }, matchSize: { width: 2, height: 2 },
      tilePixelSize: { width: 180, height: 260 }, pictures: [{ imagePath: 'images/one.png' }],
      queues: Array.from({ length: 5 }, () => ({ tiles: [] })),
    },
    selectedGameBackground: { imagePath: 'imported/background/forest.png', fingerprint: 'forest', name: 'forest.png', imported: true },
  };
  const saved = await fetch(`${url}api/level-drafts`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { draft: { version: 1, ...body } });
  const restored = await fetch(`${url}api/level-drafts?levelId=1`);
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), { draft: { version: 1, ...body } });
});
```

Add this invalid-input test:

```js
test('launcher rejects invalid draft ids, layouts, and background paths', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  context.after(() => launcher.kill('SIGTERM'));
  const validLayout = { boardSize: { width: 4, height: 4 }, queues: [], pictures: [] };
  for (const body of [
    { levelId: 0, layout: validLayout, selectedGameBackground: null },
    { levelId: 1, layout: { ...validLayout, boardSize: { width: 3, height: 3 } }, selectedGameBackground: null },
    { levelId: 1, layout: { boardSize: { width: 4, height: 4 }, queues: {} }, selectedGameBackground: null },
    { levelId: 1, layout: validLayout, selectedGameBackground: { imagePath: '../outside.png' } },
    { levelId: 1, layout: validLayout, selectedGameBackground: { imagePath: 'https://example.test/bg.png' } },
  ]) {
    const response = await fetch(`${url}api/level-drafts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(`${url}api/level-drafts?levelId=31`)).status, 400);
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail because the endpoint does not exist.**

Run: `node --test --test-name-pattern='saves and restores a level draft|rejects invalid draft' editor-launcher.test.mjs`

Expected: FAIL because `POST /api/level-drafts` returns `404`.

- [ ] **Step 3: Add server constants and helpers.**

Immediately after `MANIFEST_PATH`, add:

```python
DRAFT_ROOT = os.path.join(editor_directory, "resources", "drafts")
SUPPORTED_DRAFT_BOARD_SIZES = {4, 5, 6}
MAX_LEVEL_ID = 30


def parse_level_id(value):
    try:
        level_id = int(value)
    except (TypeError, ValueError):
        raise ValueError("关卡编号无效")
    if level_id < 1 or level_id > MAX_LEVEL_ID:
        raise ValueError("关卡编号无效")
    return level_id


def draft_path(level_id):
    os.makedirs(DRAFT_ROOT, exist_ok=True)
    path = os.path.normpath(os.path.join(DRAFT_ROOT, f"level_{level_id:04d}.json"))
    if not path.startswith(os.path.join(DRAFT_ROOT, "")):
        raise ValueError("草稿路径无效")
    return path


def is_safe_background(background):
    if background is None:
        return True
    image_path = background.get("imagePath") if isinstance(background, dict) else None
    return isinstance(image_path, str) and image_path and not image_path.startswith("/") and ".." not in image_path and not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", image_path)


def parse_draft_request(handler):
    content_length = int(handler.headers.get("Content-Length", "0"))
    if content_length <= 0 or content_length > 50 * 1024 * 1024:
        raise ValueError("草稿内容大小无效")
    payload = json.loads(handler.rfile.read(content_length).decode("utf-8"))
    level_id = parse_level_id(payload.get("levelId"))
    layout = payload.get("layout")
    background = payload.get("selectedGameBackground")
    board_size = layout.get("boardSize") if isinstance(layout, dict) else None
    width = board_size.get("width") if isinstance(board_size, dict) else None
    height = board_size.get("height") if isinstance(board_size, dict) else None
    if not isinstance(layout, dict) or width not in SUPPORTED_DRAFT_BOARD_SIZES or height != width or not isinstance(layout.get("queues"), list) or not isinstance(layout.get("pictures"), list):
        raise ValueError("草稿布局无效")
    if not is_safe_background(background):
        raise ValueError("草稿背景无效")
    return {"version": 1, "levelId": level_id, "layout": layout, "selectedGameBackground": background}


def read_draft(level_id):
    try:
        with open(draft_path(level_id), "r", encoding="utf-8") as draft_file:
            draft = json.load(draft_file)
        if draft.get("version") != 1 or draft.get("levelId") != level_id:
            return None
        layout = draft.get("layout")
        board_size = layout.get("boardSize") if isinstance(layout, dict) else None
        if not isinstance(layout, dict) or board_size.get("width") not in SUPPORTED_DRAFT_BOARD_SIZES or board_size.get("height") != board_size.get("width") or not isinstance(layout.get("queues"), list) or not isinstance(layout.get("pictures"), list) or not is_safe_background(draft.get("selectedGameBackground")):
            return None
        return draft
    except (FileNotFoundError, json.JSONDecodeError, OSError, AttributeError):
        return None


def write_draft(draft):
    destination = draft_path(draft["levelId"])
    descriptor, temporary_path = tempfile.mkstemp(dir=DRAFT_ROOT, prefix=".draft-", suffix=".json")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as draft_file:
            json.dump(draft, draft_file, ensure_ascii=False, indent=2)
            draft_file.write("\n")
        os.replace(temporary_path, destination)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
```

- [ ] **Step 4: Route GET and POST requests.**

At the top of `do_GET`, before the imported-assets branch, add:

```python
if request.path == "/api/level-drafts":
    try:
        level_id = parse_level_id(parse_qs(request.query).get("levelId", [None])[0])
        return self.send_json(200, {"draft": read_draft(level_id)})
    except ValueError as error:
        return self.send_json(400, {"error": str(error)})
```

At the top of `do_POST`, before the game-background branch, add:

```python
if urlparse(self.path).path == "/api/level-drafts":
    try:
        draft = parse_draft_request(self)
        write_draft(draft)
        return self.send_json(200, {"draft": draft})
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        return self.send_json(400, {"error": str(error)})
    except OSError as error:
        return self.send_json(500, {"error": str(error)})
```

- [ ] **Step 5: Run focused and complete launcher tests.**

Run: `node --test editor-launcher.test.mjs`

Expected: PASS; cleanup removes only `resources/drafts/level_0001.json` created by the new test.

- [ ] **Step 6: Commit when Git is available.**

```bash
git add '启动拼图素材编辑器.command' editor-launcher.test.mjs
git commit -m "feat: persist level drafts locally"
```

Do not run this command in the current non-Git workspace.

### Task 3: Wire draft save, keyboard shortcut, and draft-first loading

**Files:**
- Modify: `app.mjs:1-30,34-96,130-163,930-1029`

**Interfaces:**
- Consumes: `createDraftPayload(levelId, layout, background)` and `getUsableDraft(draft, levelId)` from Task 1.
- Consumes: `GET` and `POST /api/level-drafts` from Task 2.
- Produces: a disabled-until-loaded `#save-draft-button`, `saveCurrentDraft()`, `loadDraft(levelId)`, and `⌘S` saving behavior.

- [ ] **Step 1: Import pure draft helpers and cache the save button.**

Add these named imports:

```js
createDraftPayload,
getUsableDraft,
```

Add this DOM reference beside the other top-level button lookups:

```js
const saveDraftButton = document.querySelector('#save-draft-button');
```

Add state beside the other module variables:

```js
let savingDraft = false;
let saveDraftFeedbackTimer;
```

- [ ] **Step 2: Add button-state rendering and the two API helpers.**

Define this helper near `renderShell()`, then invoke `renderSaveDraftButton()` at the end of `renderShell()`:

```js
function renderSaveDraftButton(label = savingDraft ? '保存中…' : '保存草稿') {
  saveDraftButton.textContent = label;
  saveDraftButton.disabled = savingDraft || activeLayout == null || activeLevel == null;
}
```

Add these API helpers before `loadSelectedLevel`:

```js
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
```

- [ ] **Step 3: Add the save handler with no duplicate requests and visible feedback.**

```js
async function saveCurrentDraft() {
  if (savingDraft || activeLevel == null || activeLayout == null) return;
  const draft = createDraftPayload(activeLevel.id, activeLayout, selectedGameBackground);
  if (draft == null) {
    canvasTip.textContent = '当前关卡无法保存草稿。';
    return;
  }
  savingDraft = true;
  clearTimeout(saveDraftFeedbackTimer);
  renderSaveDraftButton();
  try {
    await postDraft(draft);
    canvasTip.textContent = `关卡 ${formatLevel(draft.levelId)} 草稿已保存。`;
    renderSaveDraftButton('已保存');
    saveDraftFeedbackTimer = window.setTimeout(() => renderSaveDraftButton(), 1600);
  } catch (error) {
    canvasTip.textContent = `草稿保存失败：${error.message}`;
  } finally {
    savingDraft = false;
    if (saveDraftButton.textContent !== '已保存') renderSaveDraftButton();
  }
}
```

- [ ] **Step 4: Load a valid draft before rendering and restore its background.**

Replace the direct assignment sequence in `loadSelectedLevel` with the following draft-aware flow. The `let` declarations are required because a failed draft request must fall back without entering the outer original-level failure handler:

```js
let draft = null;
let draftLoadError = false;
try {
  draft = await loadDraft(levelId);
} catch {
  draftLoadError = true;
}
const usableLayout = draft?.layout ?? layout;
const usableBackground = draft?.selectedGameBackground ?? null;
state = { ...state, levelId, selectedPictureIndex: null, selectedSceneTileSlot: null };
activeLevel = level;
selectedProjectPicture = null;
activeLayout = usableLayout;
selectedGameBackground = usableBackground;
activePreview = createLevelPreview(activeLayout);
applyGameBackground();
renderPreview(activeLayout, activePreview);
renderPictureLibrary(activeLayout, activePreview);
renderGameBackgroundLibrary();
renderMetadata(activeLayout, activePreview);
renderShell();
publishActivePreview();
canvasTip.textContent = draftLoadError
  ? '草稿不可用，已使用原始关卡。'
  : draft == null
    ? `已加载原始关卡 ${formatLevel(levelId)}。`
    : `已加载关卡 ${formatLevel(levelId)} 的草稿。`;
```

If `loadDraft()` throws, do not enter the existing outer load-failure branch. The code above keeps `draft = null` and retains a `draftLoadError` flag; after successful original-level rendering it sets `canvasTip.textContent = '草稿不可用，已使用原始关卡。'`. The original level remains usable.

- [ ] **Step 5: Register click and `⌘S` handlers.**

Register:

```js
saveDraftButton.addEventListener('click', saveCurrentDraft);
```

Extend the existing document `keydown` listener without changing `H` behavior:

```js
const target = event.target;
const tagName = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : '';
const isEditable = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName) || target?.isContentEditable;
if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !isEditable) {
  event.preventDefault();
  saveCurrentDraft();
  return;
}
```

Place that block before the existing `isEditorUiToggleKey(event)` guard so `⌘S` is handled independently and `H` still delegates to the existing helper.

- [ ] **Step 6: Verify syntax and complete automated suite.**

Run: `node --check app.mjs && node --test editor-state.test.mjs editor-launcher.test.mjs webgl-preview-bridge.test.mjs`

Expected: syntax check exits `0`; all Node tests pass.

- [ ] **Step 7: Commit when Git is available.**

```bash
git add app.mjs
git commit -m "feat: save and restore level drafts"
```

Do not run this command in the current non-Git workspace.

### Task 4: End-to-end manual verification and regression checks

**Files:**
- Modify: no source files unless the checks reveal a regression; add a focused test before fixing any regression.

**Interfaces:**
- Consumes: completed toolbar, draft API, and application wiring.
- Produces: evidence that drafts survive a reload without affecting original levels.

- [ ] **Step 1: Run the complete test suite fresh.**

Run: `node --check app.mjs && node --test editor-state.test.mjs editor-launcher.test.mjs webgl-preview-bridge.test.mjs`

Expected: all tests pass with no warnings.

- [ ] **Step 2: Verify toolbar scope.**

Start the editor with `./启动拼图素材编辑器.command`. Confirm the sidebar shows only “保存草稿”, while the three removed labels and `⌘Z 撤销` are absent.

- [ ] **Step 3: Verify save and restore.**

Open level 1, change its board to 5×5, swap two editable scene tiles, select an imported game background, then click “保存草稿”. Confirm the button shows `保存中…` then `已保存`, refresh the browser, and verify the 5×5 board, swapped tiles, and background return.

- [ ] **Step 4: Verify failure fallback and shortcut behavior.**

With the editor closed, replace only `resources/drafts/level_0001.json` with malformed JSON, restart and open level 1, and verify the editor loads the original layout with “草稿不可用，已使用原始关卡”。Then remove that exact draft file. With an ordinary page element focused, press `⌘S` and verify a save occurs; focus a `<select>` and press `⌘S`, and verify browser/editor save is not triggered.

- [ ] **Step 5: Commit regression tests if added and only when Git is available.**

```bash
git add editor-state.test.mjs editor-launcher.test.mjs app.mjs
git commit -m "test: cover draft save regressions"
```

Do not run this command in the current non-Git workspace.

## Plan Self-Review

- Spec coverage: Task 1 removes unused controls and provides deterministic payload validation; Task 2 provides secure, atomic persistence; Task 3 connects save, restore, status, and shortcuts; Task 4 verifies the user journey and fallback behavior.
- Placeholder scan: every action gives exact file targets, identifiers, request shapes, commands, or concrete manual acceptance criteria.
- Interface consistency: all tasks use `createDraftPayload`, `getUsableDraft`, `loadDraft`, `postDraft`, `saveCurrentDraft`, and `/api/level-drafts` with the same `version: 1` data structure.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-23-draft-save-toolbar-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review after every task.
2. **Inline Execution** — execute tasks in this session using executing-plans with checkpoints.

Which approach?
