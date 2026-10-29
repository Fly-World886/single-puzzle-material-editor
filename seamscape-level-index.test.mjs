import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLevelPreview } from './editor-state.mjs';
import { getOfficialLevel, getOfficialPictures, officialLevelCount } from './seamscape-level-index.mjs';

test('static Seamscape index reconstructs official levels without loading the full pack', async () => {
  const pack = JSON.parse(await readFile(new URL('./resources/levels/main/seamscape-square-levels.json', import.meta.url), 'utf8'));
  assert.equal(officialLevelCount, pack.levels.length);
  for (const id of [1, 10]) {
    const expected = pack.levels[id - 1];
    const actual = getOfficialLevel(id);
    assert.equal(actual.id, expected.id);
    assert.deepEqual(actual.variants[0].layout, expected.variants[0].layout);
    assert.deepEqual(createLevelPreview(actual.variants[0].layout), createLevelPreview(expected.variants[0].layout));
  }
  assert.equal(getOfficialLevel(0), null);
  assert.equal(getOfficialLevel(11), null);
  assert.deepEqual(
    getOfficialPictures().map((picture) => picture.imagePath).sort(),
    [...new Set(pack.levels.flatMap((level) => level.variants[0].layout.pictures.map((picture) => picture.imagePath)))].sort(),
  );
});
