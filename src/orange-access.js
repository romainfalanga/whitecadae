import {buildOpenings} from './content-access.js';

// The welcome text is fixed. Only already available resources accompany it.
export function buildOrange(rows = [], user = null) {
  return {openings: buildOpenings(rows, user || {}).items.filter(item =>
    item.open && item.level >= 1 && item.id.startsWith('music-')
  )};
}
