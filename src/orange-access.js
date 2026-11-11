import {buildOpenings} from './content-access.js';
import {gameLevel} from './echelon.js';
import {gameContinuation} from './game-continuation.js';

// The welcome text is fixed. Only already available resources accompany it.
export function buildOrange(rows = [], user = null) {
  return {continuation:gameContinuation(gameLevel(rows)),openings: buildOpenings(rows, user || {}).items.filter(item =>
    item.open && item.level >= 1
  )};
}
