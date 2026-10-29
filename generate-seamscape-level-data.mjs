import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const editorRoot = dirname(fileURLToPath(import.meta.url));
const outputPath = join(editorRoot, 'seamscape-level-data.mjs');

export async function writeSeamscapeLevelData(levels) {
  const entries = levels.map((level, index) => {
    const layout = level.variants?.[0]?.layout;
    const match = /^images\/seamscape\/Square_(\d{4})\.jpg$/.exec(layout?.pictures?.[0]?.imagePath ?? '');
    const size = layout?.boardSize?.width;
    if (level.id !== index + 1 || !match || !Number.isInteger(size) || size < 3 || size > 7 ||
        layout.boardSize.height !== size || layout.matchSize?.width !== size) {
      throw new Error(`Seamscape 关卡 ${index + 1} 无法生成索引`);
    }
    return [Number(match[1]), size];
  });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `// Generated from the official Seamscape level pack.\nexport default ${JSON.stringify(entries)};\n`);
  await rename(temporaryPath, outputPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pack = JSON.parse(await readFile(join(editorRoot, 'resources/levels/main/seamscape-square-levels.json'), 'utf8'));
  await writeSeamscapeLevelData(pack.levels);
  console.log(`已生成 ${pack.levels.length} 关的轻量索引。`);
}
