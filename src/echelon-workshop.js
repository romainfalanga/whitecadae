import {boardSources} from './echelon.js';
import {BOARD_SPECS} from './workshop-specs.js';
import {evaluate as arithmetic,validDraft as checkDraft,migrateDraft} from '../public/workshop-core.js';
export const boardSpec=board=>({id:board,...BOARD_SPECS[board],sources:boardSources[board]});
export const evaluate=(expr,board)=>arithmetic(expr,boardSources[board]);
export const validDraft=(draft,board)=>checkDraft(draft,boardSpec(board));
export const restoreDraft=(draft,board)=>migrateDraft(draft,boardSpec(board));
export function validateConstruction(board,draft){
  try{
    validDraft(draft,board);
    if(draft.items.length||draft.answer.some(e=>!e))return false;
    const values=draft.answer.map(e=>evaluate(e,board));
    const nums=values.map(v=>v.value);
    if(board==='infinis')return values[0].group?.count===3&&values[0].group.unit===6;
    if(values.some(v=>v.group))return false;
    if(board==='album')return nums[0]===57&&nums[1]===2;
    if(board==='first')return nums[0]===24&&nums[1]===12;
    if(board==='noZero'){
      // Each 12 assembles zero-free word blocks. One complete 12 is copied,
      // then the two matching blocks are added for the day; the other is month.
      const twelve=expr=>expr?.op==='reuse'?twelve(expr.arg):expr?.op==='join'&&
        [expr.left,expr.right].every(e=>e?.op==='stripZeros')&&evaluate(expr,board).value===12;
      const day=draft.answer[0],month=draft.answer[1];
      return nums[0]===24&&nums[1]===12&&day.op==='add'&&twelve(day.left)&&twelve(day.right)&&twelve(month)&&
        [day.left,day.right,month].filter(e=>e.op==='reuse').length===1;
    }
    if(board==='pair')return nums.every(n=>n===57);
    if(board==='date')return nums[0]===57&&nums[1]===7;
    if(board==='last')return nums[0]===57;
  }catch{return false;}
  return false;
}
