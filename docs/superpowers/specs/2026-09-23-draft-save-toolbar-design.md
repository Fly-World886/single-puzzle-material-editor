# 草稿保存工具栏设计

## 目标

删除当前工具栏中没有实现功能的“新建 / 复制关卡”“导入关卡素材”“校验并导出”三个按钮，只保留并实现“保存草稿”。草稿必须保存当前关卡的编辑布局和当前选中的游戏背景，并在下次加载同一关卡时优先恢复。

## 范围与约束

- 工具栏最终只保留一个可用操作：`保存草稿`。
- 不实现新建关卡、复制关卡、关卡素材导入、校验导出、撤销或重做。
- 不覆盖 `resources/levels/main/levels_0001_0030.json` 原始关卡包。
- 草稿按关卡独立保存到编辑器项目内的 `resources/drafts/` 目录。
- 草稿保存当前 `activeLayout` 的完整内容，包括棋盘规格、队列、图片顺序及切片位置。
- 草稿保存当前选中的游戏背景；未选择背景时保存 `null`，表示使用默认背景。
- 读取草稿失败或草稿格式无效时，自动回退到原始关卡，并显示可理解的提示，不阻止编辑器启动。
- 所有写入必须限制在编辑器自己的草稿目录内，不接受客户端传入任意文件路径。

## 工具栏交互

`index.html` 的 `.toolbar-actions` 只保留：

```html
<button id="save-draft-button" class="secondary-action" type="button">保存草稿</button>
```

快捷提示删除未实现的 `⌘Z 撤销`，保留 `⌘S 保存`，并让 `⌘S` 调用同一个保存函数；当没有加载有效关卡时保存按钮禁用。

保存按钮状态：

- 正常：`保存草稿`
- 请求进行中：`保存中…` 且按钮禁用
- 成功后：短暂显示 `已保存`，随后恢复 `保存草稿`
- 失败后：恢复 `保存草稿`，在 `canvasTip` 显示失败原因

## 草稿数据格式

每个文件使用 JSON UTF-8 编码，文件名为 `level_<四位关卡号>.json`，结构固定为：

```json
{
  "version": 1,
  "levelId": 1,
  "layout": {
    "boardSize": { "width": 4, "height": 4 },
    "matchSize": { "width": 2, "height": 2 },
    "tilePixelSize": { "width": 180, "height": 260 },
    "pictures": [],
    "queues": []
  },
  "selectedGameBackground": null
}
```

保存时对 `levelId`、`layout` 和背景对象执行结构化克隆，再发送到本地接口，避免后续 UI 改动影响正在写入的数据。背景对象至少保存 `imagePath`、`name`、`fingerprint` 和 `imported` 字段（若字段存在则保留）。读取时只接受 `version === 1`、`levelId` 与请求一致且 `layout` 为对象的草稿；无效草稿视为不可用并回退原始关卡。

## 本地接口

在 `启动拼图素材编辑器.command` 的 Python HTTP 处理器中新增：

### `GET /api/level-drafts?levelId=1`

- `200`：返回 `{ "draft": <draft> }`，存在有效草稿。
- `200`：返回 `{ "draft": null }`，草稿不存在或无法作为有效草稿使用。
- `400`：`levelId` 不是正整数或超出编辑器支持范围。

### `POST /api/level-drafts`

请求体为 `{ "levelId": 1, "layout": <layout>, "selectedGameBackground": <object|null> }`。服务端：

1. 校验 `levelId` 为 1–30 的整数。
2. 校验 `layout` 为对象，`boardSize.width/height` 为相同的 4、5 或 6，`queues` 和 `pictures` 为数组。
3. 对背景只接受 `null` 或对象；若为对象，`imagePath` 必须为非空字符串，且不能包含绝对路径、`..` 路径段或协议前缀。
4. 生成固定文件名 `level_<四位关卡号>.json`，确保路径位于 `resources/drafts/` 内。
5. 使用 `tempfile.mkstemp()` 在草稿目录生成临时文件，写入 JSON 后通过 `os.replace()` 原子替换目标文件。
6. 返回 `200` 和 `{ "draft": <savedDraft> }`。

无效请求返回 `400` 与 `{ "error": "..." }`；文件系统写入失败返回 `500`，不删除旧草稿。

## 编辑器数据流

新增 `loadDraft(levelId)` 和 `saveCurrentDraft()`：

- `loadSelectedLevel(levelId)` 读取原始关卡后，请求草稿接口；有效草稿存在时以草稿的 `layout` 和背景替换原始值，否则沿用原始布局。
- 背景恢复时，若草稿背景与已加载的导入背景库匹配则选中对应对象；若是资源路径仍然有效但对象不在库中，也保留其路径用于预览；无效背景则回退 `null`。
- 加载完成后统一调用既有 `createLevelPreview`、`renderPreview`、`renderPictureLibrary`、`renderMetadata`、`renderGameBackgroundLibrary` 和 `publishActivePreview`。
- `saveCurrentDraft()` 从当前 `activeLevel.id`、`activeLayout` 和 `selectedGameBackground` 组装请求；成功后只更新按钮状态和提示，不重新加载布局。
- `⌘S` 事件只在焦点不位于输入框、选择框、文本区域或可编辑元素时触发保存，并阻止浏览器默认保存网页行为。

## 错误处理与兼容性

- 找不到草稿文件按“无草稿”处理，不显示错误。
- JSON 损坏、版本不支持、关卡号不一致或布局字段缺失按“无效草稿”处理，并在画布提示“草稿不可用，已使用原始关卡”。
- 保存失败不清空或回滚当前编辑状态；用户仍可继续编辑并重试。
- 原始关卡加载失败的现有错误处理保持不变。
- 草稿接口不复用导入素材接口，避免把关卡布局写入图片清单。

## 测试与验收

### 自动化测试

- 在 `editor-launcher.test.mjs` 测试 `POST` 保存后 `GET` 能读取同一草稿。
- 测试保存棋盘规格、队列和背景字段后读取内容保持一致。
- 测试非法 `levelId`、非法棋盘规格、缺失 `queues/pictures` 和危险背景路径返回 `400`。
- 测试保存接口拒绝路径穿越且不在草稿目录外创建文件。
- 在 `editor-state.test.mjs` 增加纯函数测试（若提取草稿载荷组装/校验函数）：背景为 `null`、结构化克隆和无效草稿回退。

### 手动验收

1. 启动编辑器，确认工具栏只显示“保存草稿”。
2. 修改棋盘规格、切片位置和游戏背景，点击“保存草稿”，确认按钮反馈为“已保存”。
3. 刷新页面并重新进入同一关卡，确认棋盘规格、切片队列和背景恢复。
4. 删除或损坏草稿文件后重新加载，确认回退原始关卡且编辑器仍可用。
5. 在文本框或选择框聚焦时按 `⌘S`，确认快捷键不会误触发；在普通画布区域按 `⌘S`，确认会保存草稿。

## 设计自检

- 范围覆盖：按钮删除、草稿数据、背景保存、接口、加载优先级、错误处理与测试均已定义。
- 一致性：原始关卡包只读；草稿写入独立目录；保存和加载都围绕当前 `activeLayout` 与背景状态。
- 安全性：服务端固定关卡文件名和草稿目录，拒绝路径穿越；写入采用临时文件替换。
- 无占位内容：没有未定义的字段、接口路径或待定行为。
