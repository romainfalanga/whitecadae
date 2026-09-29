import {boardSources} from './echelon.js';
import {BOARD_SPECS} from './workshop-specs.js';
import {evaluate as arithmetic,validDraft as checkDraft,migrateDraft} from '../public/workshop-core.js';
export const boardSpec=board=>({...BOARD_SPECS[board],sources:boardSources[board]});
export const evaluate=(expr,board)=>arithmetic(expr,boardSources[board]);
export const validDraft=(draft,board)=>checkDraft(draft,boardSpec(board));
export const restoreDraft=(draft,board)=>migrateDraft(draft,boardSpec(board));
export function validateConstruction(board,draft){
  try{
    validDraft(draft,board);
    if(draft.items.length||draft.answer.some(e=>!e))return false;
    const values=draft.answer.map(e=>evaluate(e,board));
    const nums=values.map(v=>v.value);
    if(board==='album')return values[0].group?.count===2&&values[0].group.unit===57;
    if(board==='infinis')return values[0].group?.count===3&&values[0].group.unit===6;
    if(values.some(v=>v.group))return false;
    if(board==='first')return nums[0]===24&&nums[1]===12;
    if(board==='pair')return nums.every(n=>n===57);
    if(board==='date')return nums[0]===57&&nums[1]===7;
    if(board==='last'||board==='wanheda')return nums[0]===57;
  }catch{return false;}
  return false;
}
