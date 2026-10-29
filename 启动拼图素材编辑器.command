#!/bin/zsh
set -eu

editor_directory="${0:A:h}"
# 端口 0 让操作系统为当前实例分配空闲端口，允许多个编辑器同时启动。
port="0"
open_browser="1"

while (($# > 0)); do
  case "$1" in
    --port)
      if (($# < 2)); then
        print -u2 "--port 需要一个 0 到 65535 的端口号"
        exit 64
      fi
      port="$2"
      shift 2
      ;;
    --no-open)
      open_browser="0"
      shift
      ;;
    *)
      print -u2 "未知参数：$1"
      exit 64
      ;;
  esac
done

if [[ ! "$port" =~ '^[0-9]+$' ]] || ((port > 65535)); then
  print -u2 "端口必须是 0 到 65535 的整数"
  exit 64
fi

exec python3 - "$editor_directory" "$port" "$open_browser" <<'PYTHON'
import base64
import json
import io
import os
import re
import sys
import tempfile
import threading
import webbrowser
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

editor_directory, requested_port, open_browser = sys.argv[1:]
os.chdir(editor_directory)
SEAMSCAPE_BUILD_DIRECTORY = os.path.join(editor_directory, "Seamscape-WebGL")
ASSET_KINDS = {"puzzle", "background"}
MIME_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/ogg": ".ogv",
    "video/quicktime": ".mov",
}
FINGERPRINT_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,160}$")
DATA_URL_PATTERN = re.compile(r"^data:((?:image/(?:png|jpeg|gif|webp|svg\+xml))|(?:video/(?:mp4|webm|ogg|quicktime)));base64,([A-Za-z0-9+/=\s]+)$")
IMPORTED_ROOT = os.path.join(editor_directory, "resources", "imported")
MANIFEST_PATH = os.path.join(IMPORTED_ROOT, "manifest.json")
DRAFT_ROOT = os.path.join(editor_directory, "resources", "drafts")
CUSTOM_LEVELS_PATH = os.path.join(editor_directory, "resources", "custom-levels.json")
LEVEL_NAMES_PATH = os.path.join(editor_directory, "resources", "level-names.json")
LEVEL_NAMES_LOCK = threading.Lock()
SUPPORTED_DRAFT_BOARD_SIZES = {3, 4, 5, 6, 7}
DEMO_LEVEL_COUNT = 10
MAX_LEVEL_ID = 999999
OFFICIAL_LEVEL_PACK_PATH = os.path.join(editor_directory, "resources", "levels", "main", "seamscape-square-levels.json")
with open(OFFICIAL_LEVEL_PACK_PATH, "r", encoding="utf-8") as level_pack_file:
    OFFICIAL_LEVELS = json.load(level_pack_file)["levels"][:DEMO_LEVEL_COUNT]
FIRST_CUSTOM_LEVEL_ID = max(level["id"] for level in OFFICIAL_LEVELS) + 1
OFFICIAL_METADATA = {
    level.get("id"): level.get("seamscape", {})
    for level in OFFICIAL_LEVELS
    if isinstance(level, dict) and isinstance(level.get("id"), int)
}


def parse_level_id(value, from_query=False):
    if from_query:
        if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]{0,5}", value):
            raise ValueError("关卡编号无效")
        level_id = int(value)
    elif isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("关卡编号无效")
    else:
        level_id = value
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
    return isinstance(image_path, str) and image_path and not image_path.startswith(("/", "\\")) and ".." not in image_path and not re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", image_path)


def parse_draft_request(handler):
    content_length = int(handler.headers.get("Content-Length", "0"))
    if content_length <= 0 or content_length > 50 * 1024 * 1024:
        raise ValueError("草稿内容大小无效")
    payload = json.loads(handler.rfile.read(content_length).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("草稿内容无效")
    if "selectedGameBackground" not in payload:
        raise ValueError("草稿背景无效")
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
        if draft.get("version") != 1 or draft.get("levelId") != level_id or "selectedGameBackground" not in draft:
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


def remove_draft(level_id):
    try:
        os.unlink(draft_path(level_id))
    except FileNotFoundError:
        pass


def is_valid_custom_level(level):
    if not isinstance(level, dict) or not isinstance(level.get("id"), int) or isinstance(level.get("id"), bool) or level["id"] < FIRST_CUSTOM_LEVEL_ID or level["id"] > MAX_LEVEL_ID or level.get("enabled") is not True:
        return False
    variants = level.get("variants")
    if not isinstance(variants, list) or not variants or not isinstance(variants[0], dict):
        return False
    layout = variants[0].get("layout")
    if not isinstance(layout, dict):
        return False
    board = layout.get("boardSize")
    match = layout.get("matchSize")
    if not isinstance(board, dict) or not isinstance(match, dict) or board.get("width") not in SUPPORTED_DRAFT_BOARD_SIZES or board.get("height") != board.get("width") or not isinstance(match.get("width"), int) or match.get("width") < 1 or match.get("height") != match.get("width"):
        return False
    pictures = layout.get("pictures")
    queues = layout.get("queues")
    if not isinstance(pictures, list) or not isinstance(queues, list) or len(queues) != board["width"]:
        return False
    for picture in pictures:
        image_path = picture.get("imagePath") if isinstance(picture, dict) else None
        if not isinstance(image_path, str) or not image_path or image_path.startswith(("/", "\\")) or ".." in image_path or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", image_path):
            return False
    tile_limit = match["width"] * match["width"]
    for queue in queues:
        tiles = queue.get("tiles") if isinstance(queue, dict) else None
        if not isinstance(tiles, list):
            return False
        for tile in tiles:
            if not isinstance(tile, dict) or not isinstance(tile.get("pictureIndex"), int) or not isinstance(tile.get("tileIndex"), int) or tile["pictureIndex"] < 0 or tile["pictureIndex"] >= len(pictures) or tile["tileIndex"] < 0 or tile["tileIndex"] >= tile_limit:
                return False
    return True


def read_custom_levels():
    try:
        with open(CUSTOM_LEVELS_PATH, "r", encoding="utf-8") as level_file:
            levels = json.load(level_file).get("levels", [])
        if not isinstance(levels, list):
            return []
        valid_levels = [level for level in levels if is_valid_custom_level(level)]
        ids = [level["id"] for level in valid_levels]
        return valid_levels if len(ids) == len(set(ids)) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError, AttributeError):
        return []


def write_custom_levels(levels):
    descriptor, temporary_path = tempfile.mkstemp(dir=os.path.dirname(CUSTOM_LEVELS_PATH), prefix=".custom-levels-", suffix=".json")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as level_file:
            json.dump({"levels": levels}, level_file, ensure_ascii=False, indent=2)
            level_file.write("\n")
        os.replace(temporary_path, CUSTOM_LEVELS_PATH)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def read_level_names():
    try:
        with open(LEVEL_NAMES_PATH, "r", encoding="utf-8") as names_file:
            names = json.load(names_file).get("names", {})
        if not isinstance(names, dict):
            raise ValueError("关卡名称数据无效")
        return names
    except FileNotFoundError:
        return {}


def write_level_names(names):
    descriptor, temporary_path = tempfile.mkstemp(dir=os.path.dirname(LEVEL_NAMES_PATH), prefix=".level-names-", suffix=".json")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as names_file:
            json.dump({"names": names}, names_file, ensure_ascii=False, indent=2)
            names_file.write("\n")
        os.replace(temporary_path, LEVEL_NAMES_PATH)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def make_unity_level_export(payload):
    level = payload.get("level") if isinstance(payload, dict) else None
    layout = payload.get("layout") if isinstance(payload, dict) else None
    if not isinstance(level, dict) or not isinstance(layout, dict):
        raise ValueError("关卡数据无效")
    level_id = parse_level_id(level.get("id"))
    board = layout.get("boardSize")
    size = board.get("width") if isinstance(board, dict) else None
    if size not in SUPPORTED_DRAFT_BOARD_SIZES or board.get("height") != size:
        raise ValueError("Unity 方形关卡只支持 3 到 7 格棋盘")
    pictures = layout.get("pictures")
    picture_index = payload.get("pictureIndex", 0)
    if not isinstance(pictures, list) or isinstance(picture_index, bool) or not isinstance(picture_index, int) or picture_index < 0 or picture_index >= len(pictures):
        raise ValueError("当前关卡没有可导出的拼图图片")
    picture = pictures[picture_index]
    image_path = picture.get("imagePath") if isinstance(picture, dict) else None
    if not isinstance(image_path, str) or not image_path or image_path.startswith(("/", "\\")) or ".." in image_path or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", image_path):
        raise ValueError("拼图图片路径无效")
    resources_root = os.path.realpath(os.path.join(editor_directory, "resources"))
    image_source = os.path.realpath(os.path.join(resources_root, image_path))
    if not image_source.startswith(resources_root + os.sep) or not os.path.isfile(image_source):
        raise ValueError("找不到当前关卡图片")
    extension = os.path.splitext(image_source)[1].lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Unity 拼图只支持 JPG、PNG 或 WebP 图片")
    unity_image_index = level_id
    metadata = level.get("seamscape") if isinstance(level.get("seamscape"), dict) else OFFICIAL_METADATA.get(level_id, {})
    entry = {
        "level": level_id,
        "imageIndex": unity_image_index,
        "shape": "Square",
        "columns": size,
        "rows": size,
        "timeSeconds": metadata.get("timeSeconds", max(60, size * size * 15)),
        "seed": metadata.get("seed", level_id * 1009 + unity_image_index * 97),
        "difficulty": metadata.get("difficulty", "Normal"),
        "view1guanqia": metadata.get("view1guanqia", 0),
        "view2shengli": metadata.get("view2shengli", 0),
    }
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as package:
        package.writestr("SquareGameplayLevels.json", json.dumps({"levels": [entry]}, ensure_ascii=False, indent=2) + "\n")
        package.write(image_source, "images/Square_" + str(unity_image_index).zfill(4) + extension)
    return level_id, archive.getvalue()


def read_manifest():
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
        pictures = manifest.get("pictures", [])
        return [picture for picture in pictures if isinstance(picture, dict)]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def write_manifest(pictures):
    os.makedirs(IMPORTED_ROOT, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(dir=IMPORTED_ROOT, prefix=".manifest-", suffix=".json")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as manifest_file:
            json.dump({"pictures": pictures}, manifest_file, ensure_ascii=False, indent=2)
            manifest_file.write("\n")
        os.replace(temporary_path, MANIFEST_PATH)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


class EditorRequestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        request_path = unquote(urlparse(path).path)
        if request_path == "/seamscape" or request_path == "/seamscape/":
            return os.path.join(SEAMSCAPE_BUILD_DIRECTORY, "index.html")
        if request_path.startswith("/seamscape/"):
            root = os.path.realpath(SEAMSCAPE_BUILD_DIRECTORY)
            candidate = os.path.realpath(os.path.join(root, request_path[len("/seamscape/"):]))
            if os.path.commonpath((root, candidate)) == root:
                return candidate
            return os.path.join(root, "__forbidden__")
        return super().translate_path(path)

    def guess_type(self, path):
        if path.endswith((".wasm.br", ".wasm.gz")): return "application/wasm"
        if path.endswith((".js.br", ".js.gz")): return "application/javascript"
        if path.endswith((".data.br", ".data.gz")): return "application/octet-stream"
        return super().guess_type(path)

    def end_headers(self):
        if urlparse(self.path).path.endswith(".br"):
            self.send_header("Content-Encoding", "br")
        elif urlparse(self.path).path.endswith(".gz"):
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def parse_asset_request(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0 or content_length > 50 * 1024 * 1024:
            raise ValueError("导入内容大小无效")
        payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        kind = payload.get("kind")
        fingerprint = payload.get("fingerprint")
        name = payload.get("name")
        data_url = payload.get("dataUrl")
        if kind not in ASSET_KINDS or not isinstance(fingerprint, str) or not FINGERPRINT_PATTERN.fullmatch(fingerprint):
            raise ValueError("导入图片信息无效")
        if not isinstance(name, str) or not name.strip() or not isinstance(data_url, str):
            raise ValueError("导入图片信息不完整")
        data_url_match = DATA_URL_PATTERN.fullmatch(data_url)
        if data_url_match is None:
            raise ValueError("仅支持 PNG、JPG、GIF、WebP、SVG 图片或 MP4、WebM、OGG、MOV 视频")
        mime_type, encoded_image = data_url_match.groups()
        try:
            content = base64.b64decode(encoded_image, validate=True)
        except ValueError as error:
            raise ValueError("图片数据无法读取") from error
        if not content:
            raise ValueError("图片内容为空")
        return kind, fingerprint, os.path.basename(name), mime_type, content

    def do_GET(self):
        request = urlparse(self.path)
        if request.path in {"/seamscape", "/seamscape/"} and not os.path.isfile(os.path.join(SEAMSCAPE_BUILD_DIRECTORY, "index.html")):
            return self.send_json(503, {"error": "Seamscape WebGL 尚未构建"})
        if request.path == "/api/custom-levels":
            return self.send_json(200, {"levels": read_custom_levels()})
        if request.path == "/api/level-names":
            try:
                return self.send_json(200, {"names": read_level_names()})
            except (ValueError, OSError) as error:
                return self.send_json(500, {"error": str(error)})
        if request.path == "/api/level-drafts":
            try:
                level_id = parse_level_id(parse_qs(request.query).get("levelId", [None])[0], from_query=True)
                return self.send_json(200, {"draft": read_draft(level_id)})
            except ValueError as error:
                return self.send_json(400, {"error": str(error)})
        if request.path != "/api/imported-assets":
            return super().do_GET()
        kind = parse_qs(request.query).get("kind", [None])[0]
        if kind not in ASSET_KINDS:
            return self.send_json(400, {"error": "图片类别无效"})
        pictures = [picture for picture in read_manifest() if picture.get("kind") == kind]
        return self.send_json(200, {"pictures": [{key: value for key, value in picture.items() if key != "kind"} for picture in pictures]})

    def do_POST(self):
        if urlparse(self.path).path == "/api/level-names":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                if content_length <= 0 or content_length > 4096:
                    raise ValueError("关卡名称内容大小无效")
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("关卡名称数据无效")
                level_id = parse_level_id(payload.get("levelId"))
                name = payload.get("name")
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
                    raise ValueError("关卡名称需为 1 到 40 个字符")
                name = name.strip()
                with LEVEL_NAMES_LOCK:
                    if not any(level["id"] == level_id for level in [*OFFICIAL_LEVELS, *read_custom_levels()]):
                        raise ValueError("关卡不存在")
                    names = read_level_names()
                    names[str(level_id)] = name
                    write_level_names(names)
                return self.send_json(200, {"levelId": level_id, "name": name})
            except (UnicodeDecodeError, ValueError) as error:
                return self.send_json(400, {"error": str(error)})
            except OSError as error:
                return self.send_json(500, {"error": str(error)})
        if urlparse(self.path).path == "/api/export-level":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                if content_length <= 0 or content_length > 50 * 1024 * 1024:
                    raise ValueError("导出内容大小无效")
                payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
                level_id, archive = make_unity_level_export(payload)
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f'attachment; filename="level-{level_id}.zip"')
                self.send_header("Content-Length", str(len(archive)))
                self.end_headers()
                self.wfile.write(archive)
                return
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
                return self.send_json(400, {"error": str(error)})
            except OSError as error:
                return self.send_json(500, {"error": str(error)})
        if urlparse(self.path).path == "/api/custom-levels":
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                if content_length <= 0 or content_length > 50 * 1024 * 1024:
                    raise ValueError("关卡内容大小无效")
                level = json.loads(self.rfile.read(content_length).decode("utf-8")).get("level")
                if not is_valid_custom_level(level):
                    raise ValueError("自定义关卡无效")
                levels = read_custom_levels()
                if any(existing["id"] == level["id"] for existing in levels):
                    raise ValueError("关卡编号已存在")
                write_custom_levels([*levels, level])
                remove_draft(level["id"])
                return self.send_json(201, {"level": level})
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
                return self.send_json(400, {"error": str(error)})
            except OSError as error:
                return self.send_json(500, {"error": str(error)})
        if urlparse(self.path).path == "/api/level-drafts":
            try:
                draft = parse_draft_request(self)
                write_draft(draft)
                return self.send_json(200, {"draft": draft})
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
                return self.send_json(400, {"error": str(error)})
            except OSError as error:
                return self.send_json(500, {"error": str(error)})
        if urlparse(self.path).path != "/api/imported-assets":
            return self.send_json(404, {"error": "接口不存在"})
        try:
            kind, fingerprint, name, mime_type, content = self.parse_asset_request()
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            return self.send_json(400, {"error": str(error)})

        extension = MIME_EXTENSIONS[mime_type]
        relative_path = f"imported/{kind}/{fingerprint}{extension}"
        absolute_path = os.path.join(editor_directory, "resources", relative_path)
        os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
        existing_pictures = read_manifest()
        picture = {"imagePath": relative_path, "fingerprint": fingerprint, "name": name, "imported": True}
        if mime_type.startswith("video/"):
            picture["mimeType"] = mime_type
            picture["mediaType"] = "video"
        is_existing = any(item.get("kind") == kind and item.get("fingerprint") == fingerprint for item in existing_pictures)
        if not is_existing:
            descriptor, temporary_path = tempfile.mkstemp(dir=os.path.dirname(absolute_path), prefix=".asset-", suffix=extension)
            try:
                with os.fdopen(descriptor, "wb") as image_file:
                    image_file.write(content)
                os.replace(temporary_path, absolute_path)
            finally:
                if os.path.exists(temporary_path):
                    os.unlink(temporary_path)
            write_manifest([*existing_pictures, {**picture, "kind": kind}])
        return self.send_json(200 if is_existing else 201, {"picture": picture})

    def do_DELETE(self):
        request = urlparse(self.path)
        if request.path == "/api/custom-levels":
            try:
                level_id = parse_level_id(parse_qs(request.query).get("levelId", [None])[0], from_query=True)
                if level_id < FIRST_CUSTOM_LEVEL_ID:
                    raise ValueError("只能删除编辑器新建的关卡")
                levels = read_custom_levels()
                remaining = [level for level in levels if level["id"] != level_id]
                if len(remaining) == len(levels):
                    return self.send_json(404, {"removed": False})
                with LEVEL_NAMES_LOCK:
                    names = read_level_names()
                    if str(level_id) in names:
                        del names[str(level_id)]
                        write_level_names(names)
                    write_custom_levels(remaining)
                remove_draft(level_id)
                return self.send_json(200, {"removed": True})
            except ValueError as error:
                return self.send_json(400, {"error": str(error)})
            except OSError as error:
                return self.send_json(500, {"error": str(error)})
        if request.path != "/api/imported-assets":
            return self.send_json(404, {"error": "接口不存在"})
        query = parse_qs(request.query)
        kind = query.get("kind", [None])[0]
        fingerprint = query.get("fingerprint", [None])[0]
        if kind not in ASSET_KINDS or not isinstance(fingerprint, str) or not FINGERPRINT_PATTERN.fullmatch(fingerprint):
            return self.send_json(400, {"error": "删除目标无效"})
        existing_pictures = read_manifest()
        removed = [picture for picture in existing_pictures if picture.get("kind") == kind and picture.get("fingerprint") == fingerprint]
        if not removed:
            return self.send_json(404, {"removed": False})
        remaining = [picture for picture in existing_pictures if picture not in removed]
        for picture in removed:
            image_path = picture.get("imagePath", "")
            absolute_path = os.path.normpath(os.path.join(editor_directory, "resources", image_path))
            if absolute_path.startswith(os.path.join(IMPORTED_ROOT, "")) and os.path.isfile(absolute_path):
                os.unlink(absolute_path)
        write_manifest(remaining)
        return self.send_json(200, {"removed": True})


server = ThreadingHTTPServer(("127.0.0.1", int(requested_port)), EditorRequestHandler)
url = f"http://127.0.0.1:{server.server_port}/"
print(f"Editor URL: {url}", flush=True)

if open_browser == "1":
    threading.Timer(0.1, webbrowser.open, args=(url,)).start()

try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
PYTHON
