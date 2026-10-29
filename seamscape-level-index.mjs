import officialLevelData from './seamscape-level-data.mjs';

// Keep the editor lightweight: levels 1-10 are the built-in demonstration set.
export const officialLevelCount = Math.min(10, officialLevelData.length);
const editorLevelData = officialLevelData.slice(0, officialLevelCount);

function imagePath(imageIndex) {
  return `images/seamscape/Square_${String(imageIndex).padStart(4, '0')}.jpg`;
}

export function getOfficialLevel(levelId) {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > officialLevelCount) return null;
  const [imageIndex, size] = editorLevelData[levelId - 1];
  const queues = Array.from({ length: size }, () => ({ tiles: [] }));
  for (let tileIndex = 0; tileIndex < size * size; tileIndex += 1) {
    queues[tileIndex % size].tiles.push({ pictureIndex: 0, tileIndex });
  }
  return {
    id: levelId,
    enabled: true,
    variants: [{
      tier: 1,
      difficulty: 0,
      layout: {
        boardSize: { width: size, height: size },
        matchSize: { width: size, height: size },
        tilePixelSize: { width: 168, height: 256 },
        pictures: [{ imagePath: imagePath(imageIndex) }],
        queues,
      },
    }],
  };
}

export function getOfficialPictures() {
  return [...new Set(editorLevelData.map(([imageIndex]) => imageIndex))]
    .sort((left, right) => left - right)
    .map((imageIndex) => ({ imagePath: imagePath(imageIndex) }));
}
