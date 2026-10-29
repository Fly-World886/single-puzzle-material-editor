# 单拼图素材编辑器

本地运行的拼图素材与关卡编辑器，包含 Web 编辑界面、Python 本地服务及 Seamscape WebGL 预览。

## 获取项目

WebGL 构建及视频文件使用 Git LFS 管理。请先安装 Git LFS，再克隆仓库；在已有工作目录中可执行：

```sh
git lfs install
git lfs pull
```

## 启动

需要 Python 3 和现代浏览器。macOS 下双击 `启动拼图素材编辑器.command`，或在项目目录执行：

```sh
zsh ./启动拼图素材编辑器.command
```

服务会自动选择本机空闲端口并打开浏览器。也可以指定端口并关闭自动打开浏览器：

```sh
zsh ./启动拼图素材编辑器.command --port 8080 --no-open
```

在终端按 `Ctrl+C` 停止服务。

## 测试

安装支持内置测试运行器的 Node.js 后执行：

```sh
node --test *.test.mjs
```

## 目录

- `index.html`、`app.mjs`、`styles.css`：编辑器界面。
- `editor-state.mjs`：编辑器状态逻辑。
- `Seamscape-WebGL/`：游戏预览构建。
- `resources/`：关卡、素材目录与已导入资源。
- `docs/`：设计和实现文档。
