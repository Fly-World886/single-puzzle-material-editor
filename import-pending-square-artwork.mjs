import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const editorRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(process.argv[2] ?? join(editorRoot, '..', '拼图新5/Assets/RemoteContent/PendingSquareArtwork'));
const collection = process.argv[3] ?? 'pending-square';
const extension = process.argv[4] ?? 'png';
if (!/^[a-z0-9-]+$/.test(collection) || !['png', 'jpg'].includes(extension)) {
  throw new Error('素材分类或图片格式无效');
}
const outputRoot = join(editorRoot, 'resources/images', collection);
const catalogPath = join(outputRoot, 'catalog.json');
const names = (await readdir(sourceRoot))
  .filter((name) => new RegExp(`^Square_\\d{4}\\.${extension}$`).test(name))
  .sort();
if (names.length === 0) throw new Error(`没有找到 Square_####.${extension} 图片`);

await mkdir(outputRoot, { recursive: true });
const pictures = [];
for (let offset = 0; offset < names.length; offset += 8) {
  const batch = await Promise.all(names.slice(offset, offset + 8).map(async (name) => {
    const source = join(sourceRoot, name);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(source)) hash.update(chunk);
    await copyFile(source, join(outputRoot, name), constants.COPYFILE_FICLONE);
    return {
      imagePath: `images/${collection}/${name}`,
      name,
      fingerprint: hash.digest('hex'),
      source: collection,
    };
  }));
  pictures.push(...batch);
}
const temporaryPath = `${catalogPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify({ pictures })}\n`);
await rename(temporaryPath, catalogPath);
console.log(`已导入 ${pictures.length} 张 ${collection} 图片。`);
