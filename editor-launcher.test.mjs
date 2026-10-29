import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const editorDirectory = fileURLToPath(new URL('.', import.meta.url));
const launcherPath = fileURLToPath(new URL('./启动拼图素材编辑器.command', import.meta.url));

function startLauncher(args = ['--no-open']) {
  return spawn('/bin/zsh', [launcherPath, ...args], {
    cwd: editorDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForLauncherUrl(launcher) {
  let output = '';
  launcher.stdout.setEncoding('utf8');
  launcher.stdout.on('data', (chunk) => { output += chunk; });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`launcher did not provide a URL: ${output}`)), 3000);
    launcher.stdout.on('data', () => {
      const match = output.match(/Editor URL: (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match == null) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    launcher.once('exit', (code) => reject(new Error(`launcher exited before serving the editor: ${code}`)));
  });
}

test('launcher serves the editor from an automatically assigned loopback HTTP URL', async (context) => {
  const launcher = startLauncher();
  context.after(() => launcher.kill('SIGTERM'));

  const url = await waitForLauncherUrl(launcher);

  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /拼图素材编辑器/);
});

test('launcher exposes only the editor-local Seamscape WebGL build', async (context) => {
  const launcher = startLauncher();
  context.after(() => launcher.kill('SIGTERM'));
  const url = await waitForLauncherUrl(launcher);
  const response = await fetch(`${url}seamscape/?editorPreview=1`);
  const buildExists = existsSync(join(editorDirectory, 'Seamscape-WebGL', 'index.html'));
  assert.equal(response.status, buildExists ? 200 : 503);
  const escape = await fetch(`${url}seamscape/%2e%2e/%2e%2e/Seamscape/AGENTS.md`);
  assert.notEqual(escape.status, 200);
});

test('launcher serves the Seamscape preview without legacy WebGL routes', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  context.after(() => launcher.kill('SIGTERM'));
  const url = await waitForLauncherUrl(launcher);
  const response = await fetch(url);
  const document = await response.text();
  assert.equal(response.status, 200);
  assert.match(document, /单拼图素材编辑器/);
  for (const route of ['/control/', '/demo/', '/game/']) {
    assert.equal((await fetch(`${url}${route}`)).status, 404);
  }
});

test('two default launchers use different ports and can serve concurrently', async (context) => {
  const first = startLauncher();
  const second = startLauncher();
  context.after(() => {
    first.kill('SIGTERM');
    second.kill('SIGTERM');
  });

  const [firstUrl, secondUrl] = await Promise.all([waitForLauncherUrl(first), waitForLauncherUrl(second)]);
  assert.notEqual(firstUrl, secondUrl);

  const [firstResponse, secondResponse] = await Promise.all([fetch(firstUrl), fetch(secondUrl)]);
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
});

test('launcher persists imported puzzle images and backgrounds in the editor resources', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  const fingerprint = `test-${process.pid}-${Date.now()}`;
  const backgroundFingerprint = `${fingerprint}-background`;
  const body = {
    kind: 'puzzle',
    fingerprint,
    name: 'saved image.png',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,aGVsbG8=',
  };
  context.after(async () => {
    await fetch(`${url}api/imported-assets?kind=puzzle&fingerprint=${encodeURIComponent(fingerprint)}`, { method: 'DELETE' });
    await fetch(`${url}api/imported-assets?kind=background&fingerprint=${encodeURIComponent(backgroundFingerprint)}`, { method: 'DELETE' });
    launcher.kill('SIGTERM');
  });

  const saved = await fetch(`${url}api/imported-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(saved.status, 201);
  assert.deepEqual(await saved.json(), {
    picture: {
      imagePath: `imported/puzzle/${fingerprint}.png`,
      fingerprint,
      name: 'saved image.png',
      imported: true,
    },
  });

  const restored = await fetch(`${url}api/imported-assets?kind=puzzle`);
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).pictures.find((picture) => picture.fingerprint === fingerprint), {
    imagePath: `imported/puzzle/${fingerprint}.png`,
    fingerprint,
    name: 'saved image.png',
    imported: true,
  });

  const savedBackground = await fetch(`${url}api/imported-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, kind: 'background', fingerprint: backgroundFingerprint, name: 'saved background.png' }),
  });
  assert.equal(savedBackground.status, 201);
  assert.deepEqual(await savedBackground.json(), {
    picture: {
      imagePath: `imported/background/${backgroundFingerprint}.png`,
      fingerprint: backgroundFingerprint,
      name: 'saved background.png',
      imported: true,
    },
  });

  const restoredBackgrounds = await fetch(`${url}api/imported-assets?kind=background`);
  assert.equal(restoredBackgrounds.status, 200);
  assert.deepEqual((await restoredBackgrounds.json()).pictures.find((picture) => picture.fingerprint === backgroundFingerprint), {
    imagePath: `imported/background/${backgroundFingerprint}.png`,
    fingerprint: backgroundFingerprint,
    name: 'saved background.png',
    imported: true,
  });
});

test('launcher exports a Unity-compatible single-level zip with only config and image', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  context.after(() => launcher.kill('SIGTERM'));
  const response = await fetch(`${url}api/export-level`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      level: {
        id: 11,
        enabled: true,
        variants: [{ tier: 1, difficulty: 0, layout: {} }],
      },
      layout: {
        boardSize: { width: 3, height: 3 },
        matchSize: { width: 3, height: 3 },
        tilePixelSize: { width: 168, height: 256 },
        pictures: [{ imagePath: 'images/seamscape/Square_0001.jpg' }],
        queues: Array.from({ length: 3 }, (_, column) => ({
          tiles: Array.from({ length: 3 }, (_, row) => ({ pictureIndex: 0, tileIndex: row * 3 + column })),
        })),
      },
    }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/zip/);
  assert.match(response.headers.get('content-disposition') ?? '', /level-11\.zip/);
  const archive = Buffer.from(await response.arrayBuffer());
  assert.equal(archive.subarray(0, 2).toString('ascii'), 'PK');
  const contents = JSON.parse(execFileSync('python3', ['-c', [
    'import io,json,sys,zipfile',
    'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
    'print(json.dumps({"names":z.namelist(),"config":json.loads(z.read("SquareGameplayLevels.json"))}))',
  ].join(';')], { input: archive, encoding: 'utf8' }));
  assert.deepEqual(contents.names.sort(), [
    'SquareGameplayLevels.json', 'images/Square_0011.jpg',
  ].sort());
  assert.deepEqual(contents.config.levels[0], {
    level: 11,
    imageIndex: 11,
    shape: 'Square',
    columns: 3,
    rows: 3,
    timeSeconds: 135,
    seed: 11 * 1009 + 11 * 97,
    difficulty: 'Normal',
    view1guanqia: 0,
    view2shengli: 0,
  });
});

test('launcher restores official Unity metadata when exporting an official level', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  context.after(() => launcher.kill('SIGTERM'));
  const response = await fetch(`${url}api/export-level`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      level: { id: 1, enabled: true, variants: [{ layout: {} }] },
      layout: {
        boardSize: { width: 3, height: 3 },
        matchSize: { width: 3, height: 3 },
        pictures: [{ imagePath: 'images/seamscape/Square_0001.jpg' }],
        queues: Array.from({ length: 3 }, () => ({ tiles: [] })),
      },
    }),
  });
  assert.equal(response.status, 200);
  const archive = Buffer.from(await response.arrayBuffer());
  const contents = JSON.parse(execFileSync('python3', ['-c', [
    'import io,json,sys,zipfile',
    'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
    'print(z.read("SquareGameplayLevels.json").decode())',
  ].join(';')], { input: archive, encoding: 'utf8' }));
  assert.deepEqual(contents.levels[0], {
    level: 1,
    imageIndex: 1,
    shape: 'Square',
    columns: 3,
    rows: 3,
    timeSeconds: 141,
    seed: 3,
    difficulty: 'Normal',
    view1guanqia: 1,
    view2shengli: 1,
  });
});

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

test('launcher persists and deletes an empty custom level for the editor list', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  const customLevelPath = join(editorDirectory, 'resources', 'custom-levels.json');
  const levelPack = JSON.parse(await readFile(join(editorDirectory, 'resources', 'levels', 'main', 'seamscape-square-levels.json')));
  const originalCustomLevels = await readFile(customLevelPath).catch(() => null);
  const existingLevels = originalCustomLevels == null ? [] : JSON.parse(originalCustomLevels).levels;
  const levelId = Math.max(...levelPack.levels.map((level) => level.id), ...existingLevels.map((level) => level.id)) + 1;
  const draftPath = join(editorDirectory, 'resources', 'drafts', `level_${String(levelId).padStart(4, '0')}.json`);
  const namesPath = join(editorDirectory, 'resources', 'level-names.json');
  const originalNames = await readFile(namesPath).catch(() => null);
  context.after(async () => {
    await rm(draftPath, { force: true });
    if (originalCustomLevels == null) await rm(customLevelPath, { force: true });
    else await writeFile(customLevelPath, originalCustomLevels);
    if (originalNames == null) await rm(namesPath, { force: true });
    else await writeFile(namesPath, originalNames);
    launcher.kill('SIGTERM');
  });
  const level = {
    id: levelId,
    enabled: true,
    variants: [{
      tier: 1,
      difficulty: 0,
      layout: {
        boardSize: { width: 4, height: 4 },
        matchSize: { width: 2, height: 2 },
        tilePixelSize: { width: 180, height: 260 },
        pictures: [],
        queues: Array.from({ length: 4 }, () => ({ tiles: [] })),
      },
    }],
  };

  const staleDraft = {
    levelId,
    layout: {
      ...level.variants[0].layout,
      pictures: [{ imagePath: 'images/missing.png' }],
      queues: Array.from({ length: 4 }, () => ({ tiles: [{ pictureIndex: 0, tileIndex: 0 }] })),
    },
    selectedGameBackground: null,
  };
  const savedStaleDraft = await fetch(`${url}api/level-drafts`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(staleDraft),
  });
  assert.equal(savedStaleDraft.status, 200);

  const created = await fetch(`${url}api/custom-levels`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level }),
  });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { level });

  const restored = await fetch(`${url}api/custom-levels`);
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).levels.find((candidate) => candidate.id === levelId), level);

  const clearedDraft = await fetch(`${url}api/level-drafts?levelId=${levelId}`);
  assert.equal(clearedDraft.status, 200);
  assert.deepEqual(await clearedDraft.json(), { draft: null });

  const draft = {
    levelId,
    layout: level.variants[0].layout,
    selectedGameBackground: null,
  };
  const savedDraft = await fetch(`${url}api/level-drafts`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
  });
  assert.equal(savedDraft.status, 200);
  const restoredDraft = await fetch(`${url}api/level-drafts?levelId=${levelId}`);
  assert.equal(restoredDraft.status, 200);
  assert.deepEqual(await restoredDraft.json(), { draft: { version: 1, ...draft } });

  const renamed = await fetch(`${url}api/level-names`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ levelId, name: '新建测试关卡' }),
  });
  assert.equal(renamed.status, 200);
  assert.equal((await (await fetch(`${url}api/level-names`)).json()).names[levelId], '新建测试关卡');
  assert.deepEqual((await (await fetch(`${url}api/level-drafts?levelId=${levelId}`)).json()).draft, { version: 1, ...draft });

  const deleted = await fetch(`${url}api/custom-levels?levelId=${levelId}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { removed: true });
  const remaining = await fetch(`${url}api/custom-levels`);
  assert.equal(remaining.status, 200);
  assert.equal((await remaining.json()).levels.some((candidate) => candidate.id === levelId), false);
  const removedDraft = await fetch(`${url}api/level-drafts?levelId=${levelId}`);
  assert.equal(removedDraft.status, 200);
  assert.deepEqual(await removedDraft.json(), { draft: null });
  assert.equal((await (await fetch(`${url}api/level-names`)).json()).names[levelId], undefined);
});

test('launcher persists official level names and rejects invalid renames', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  const namesPath = join(editorDirectory, 'resources', 'level-names.json');
  const originalNames = await readFile(namesPath).catch(() => null);
  context.after(async () => {
    if (originalNames == null) await rm(namesPath, { force: true });
    else await writeFile(namesPath, originalNames);
    launcher.kill('SIGTERM');
  });
  const rename = (body) => fetch(`${url}api/level-names`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const renamed = await rename({ levelId: 1, name: '  海边拼图  ' });
  assert.equal(renamed.status, 200);
  assert.deepEqual(await renamed.json(), { levelId: 1, name: '海边拼图' });
  assert.equal((await (await fetch(`${url}api/level-names`)).json()).names[1], '海边拼图');
  assert.equal(JSON.parse(await readFile(namesPath)).names[1], '海边拼图');
  for (const body of [
    { levelId: 1, name: '' }, { levelId: 1, name: '   ' }, { levelId: 1, name: '关'.repeat(41) },
    { levelId: 1, name: 123 }, { levelId: true, name: '无效' }, { levelId: 999999, name: '不存在' },
  ]) assert.equal((await rename(body)).status, 400);
  assert.equal((await (await fetch(`${url}api/level-names`)).json()).names[1], '海边拼图');
});

test('launcher rejects invalid draft ids, layouts, and background paths', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  context.after(() => launcher.kill('SIGTERM'));
  const validLayout = { boardSize: { width: 4, height: 4 }, queues: [], pictures: [] };
  for (const body of [
    [],
    { levelId: true, layout: validLayout, selectedGameBackground: null },
    { levelId: '1', layout: validLayout, selectedGameBackground: null },
    { levelId: 0, layout: validLayout, selectedGameBackground: null },
    { levelId: 1, layout: { ...validLayout, boardSize: { width: 2, height: 2 } }, selectedGameBackground: null },
    { levelId: 1, layout: { boardSize: { width: 4, height: 4 }, queues: {} }, selectedGameBackground: null },
    { levelId: 1, layout: validLayout },
    { levelId: 1, layout: validLayout, selectedGameBackground: { imagePath: '../outside.png' } },
    { levelId: 1, layout: validLayout, selectedGameBackground: { imagePath: '\\\\server\\share.png' } },
    { levelId: 1, layout: validLayout, selectedGameBackground: { imagePath: 'https://example.test/bg.png' } },
  ]) {
    const response = await fetch(`${url}api/level-drafts`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(`${url}api/level-drafts?levelId=1000000`)).status, 400);
  assert.equal((await fetch(`${url}api/level-drafts?levelId=true`)).status, 400);
  assert.equal((await fetch(`${url}api/level-drafts?levelId=1.0`)).status, 400);
});

test('launcher treats a malformed stored level draft as absent', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  const draftPath = join(editorDirectory, 'resources', 'drafts', 'level_0001.json');
  context.after(async () => {
    await rm(draftPath, { force: true });
    launcher.kill('SIGTERM');
  });
  await mkdir(dirname(draftPath), { recursive: true });
  await writeFile(draftPath, '{ malformed', 'utf8');

  const restored = await fetch(`${url}api/level-drafts?levelId=1`);
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), { draft: null });
});

test('launcher preserves the previous draft when atomic draft writing fails', async (context) => {
  const launcher = startLauncher(['--port', '0', '--no-open']);
  const url = await waitForLauncherUrl(launcher);
  const draftPath = join(editorDirectory, 'resources', 'drafts', 'level_0001.json');
  const draftRoot = dirname(draftPath);
  const original = {
    levelId: 1,
    layout: { boardSize: { width: 4, height: 4 }, queues: [], pictures: [] },
    selectedGameBackground: null,
  };
  context.after(async () => {
    await chmod(draftRoot, 0o755).catch(() => {});
    await rm(draftPath, { force: true });
    launcher.kill('SIGTERM');
  });
  const saved = await fetch(`${url}api/level-drafts`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(original),
  });
  assert.equal(saved.status, 200);
  await chmod(draftRoot, 0o500);
  const replacement = { ...original, layout: { ...original.layout, boardSize: { width: 5, height: 5 } } };
  const failed = await fetch(`${url}api/level-drafts`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(replacement),
  });
  assert.equal(failed.status, 500);
  await chmod(draftRoot, 0o755);
  const restored = await fetch(`${url}api/level-drafts?levelId=1`);
  assert.deepEqual(await restored.json(), { draft: { version: 1, ...original } });
});
