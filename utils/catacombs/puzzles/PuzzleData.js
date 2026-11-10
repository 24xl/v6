// Reads puzzle solution data from assets/ (boulderSolutions.json, creeperBeamSolutions.json,
// quizSolutions.json, waterSolutions.json).
//
//   import { loadPuzzleData } from '../../../utils/catacombs/puzzles/PuzzleData';
//   const solutions = loadPuzzleData('quizSolutions.json');

import { File, globalAssetsDir } from '../../Constants';

const cache = new Map();

export function loadPuzzleData(fileName) {
    if (cache.has(fileName)) return cache.get(fileName);

    try {
        const file = new File(globalAssetsDir, fileName);
        if (!file.exists()) {
            console.error('[PuzzleData] Asset missing: ' + fileName);
            return null;
        }
        const raw = FileLib.read(file.getPath());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        cache.set(fileName, parsed);
        return parsed;
    } catch (e) {
        console.error('[PuzzleData] Failed to load ' + fileName + ': ' + e);
        return null;
    }
}