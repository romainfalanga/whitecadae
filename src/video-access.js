// Which video categories a member may see, on their own videography or on an
// AS's: a category opens with the echelon, and an AS's category shows only
// once both members have reached it.
import {openBranches,sharedBranches,branchLevel,storedVideoBranch} from '../public/video-model.js';
import {levelOf} from './private-access.js';
import {fail} from './private-data.js';

export async function viewableBranches(env,viewerId,ownerId=viewerId){
  const viewer=await levelOf(env,viewerId);
  return ownerId===viewerId?openBranches(viewer):sharedBranches(viewer,await levelOf(env,ownerId));
}
// Category keys are fixed constants: they are safe to inline in SQL.
export const branchList=branches=>branches.length?branches.map(key=>`'${storedVideoBranch(key)}'`).join(','):`''`;
export function lockedBranch(key){fail(`Cette catégorie s’ouvre à l’échelon ${branchLevel(key)}.`,403);}
