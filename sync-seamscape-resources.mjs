import { createDecipheriv, createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSeamscapeLevelData } from './generate-seamscape-level-data.mjs';

const editorRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(process.argv[2] ?? join(editorRoot, '..', 'Seamscape'));
const configPath = join(sourceRoot, 'Assets/RemoteContent/Configs/Jigsaw/SquareGameplayLevels.bytes');
const outputPath = join(editorRoot, 'resources/levels/main/seamscape-square-levels.json');
const imageOutput = join(editorRoot, 'resources/images/seamscape');

function decryptConfig(encoded) {
  const payload = Buffer.from(encoded.trim(), 'base64');
  if (payload.subarray(0, 5).toString('ascii') !== 'JCFG\x01' || payload.length < 85) {
    throw new Error('Seamscape 关卡配置格式无效');
  }
  const keyMaterial = pbkdf2Sync('pintuxin5156736565', payload.subarray(5, 21), 100000, 64, 'sha256');
  const authentication = createHmac('sha256', keyMaterial.subarray(32)).update(payload.subarray(0, -32)).digest();
  if (!timingSafeEqual(authentication, payload.subarray(-32))) throw new Error('Seamscape 关卡配置校验失败');
  const decipher = createDecipheriv('aes-256-cbc', keyMaterial.subarray(0, 32), payload.subarray(21, 37));
  return JSON.parse(Buffer.concat([decipher.update(payload.subarray(37, -32)), decipher.final()]).toString('utf8'));
}

function imageSource(index) {
  const name = `Square_${String(index).padStart(4, '0')}.jpg`;
  return {
    name,
    path: join(sourceRoot, index <= 50
      ? `Assets/Resources/Sprite/Square/${name}`
      : `Assets/RemoteContent/Square/${name}`),
  };
}

function convertLevel(entry) {
  const size = Math.max(3, Math.min(7, Math.max(entry.columns, entry.rows)));
  const queues = Array.from({ length: size }, () => ({ tiles: [] }));
  for (let tileIndex = 0; tileIndex < size * size; tileIndex += 1) {
    queues[tileIndex % size].tiles.push({ pictureIndex: 0, tileIndex });
  }
  return {
    id: entry.level,
    enabled: true,
    seamscape: entry,
    variants: [{
      tier: 1,
      difficulty: 0,
      layout: {
        boardSize: { width: size, height: size },
        matchSize: { width: size, height: size },
        tilePixelSize: { width: 168, height: 256 },
        pictures: [{ imagePath: `images/seamscape/${imageSource(entry.imageIndex).name}` }],
        queues,
      },
    }],
  };
}

const source = decryptConfig(await readFile(configPath, 'utf8'));
if (!Array.isArray(source.levels) || source.levels.length === 0) throw new Error('Seamscape 关卡配置为空');
const entries = [...source.levels].sort((left, right) => left.level - right.level);
for (let index = 0; index < entries.length; index += 1) {
  const entry = entries[index];
  if (entry.level !== index + 1 || !Number.isInteger(entry.imageIndex) || entry.imageIndex < 1 ||
      !Number.isInteger(entry.columns) || !Number.isInteger(entry.rows) || entry.columns < 2 || entry.rows < 2) {
    throw new Error(`Seamscape 关卡 ${index + 1} 数据无效`);
  }
}
const imageIndices = [...new Set(entries.map((entry) => entry.imageIndex))].sort((left, right) => left - right);
for (const index of imageIndices) await stat(imageSource(index).path);

await mkdir(imageOutput, { recursive: true });
await Promise.all(imageIndices.map(async (index) => {
  const image = imageSource(index);
  await copyFile(image.path, join(imageOutput, image.name));
}));
const temporaryPath = `${outputPath}.tmp`;
const levels = entries.map(convertLevel);
await writeFile(temporaryPath, `${JSON.stringify({ levels })}\n`);
await rename(temporaryPath, outputPath);
await writeSeamscapeLevelData(levels);
console.log(`已同步 ${entries.length} 个 Seamscape 关卡和 ${imageIndices.length} 张图片。`);
