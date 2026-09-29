import {buildOpenings} from './content-access.js';

// The welcome text is fixed. Only already available resources accompany it.
export function buildOrange(rows = [], user = null) {
  return {openings: buildOpenings(rows, user || {}).items.filter(item =>
    item.open && item.level >= 1 && item.id.startsWith('music-')
  ).map(item=>({...item,...(item.id==='music-wanheda'?{paragraph:'Avant de rejoindre son paradis, Vulpis s’appelait AA. Le 18 juillet 2019, il a vécu quelque chose qui permet de comprendre comment, par la suite, il a réussi à rejoindre son paradis. Wanheda ouvre cette partie de son histoire.'}:{})}))};
}
