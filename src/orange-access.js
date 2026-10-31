import {buildOpenings} from './content-access.js';
import {gameLevel} from './echelon.js';
import {gameContinuation} from './game-continuation.js';

// The welcome text is fixed. Only already available resources accompany it.
export function buildOrange(rows = [], user = null) {
  return {continuation:gameContinuation(gameLevel(rows)),openings: buildOpenings(rows, user || {}).items.filter(item =>
    item.open && item.level >= 1
  ).map(item=>({...item,...(item.id==='music-un-fil-entre-deux-infinis'?{paragraph:'Avant de s’appeler Vulpis, il s’appelait AA. Dans Un fil entre deux infinis, il raconte ce qu’il a vécu le 18 juillet 2019, une expérience qui permet de comprendre comment, par la suite, il a réussi à rejoindre son paradis.'}:{})}))};
}
