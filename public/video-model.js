export const VIDEO_BRANCHES=[
  ['self','Métacognition'],
  ['ideas','Réflexions'],
  ['projects','Idées et projets'],
  ['society','Ma société harmonieuse'],
];
export const videoLabel=key=>VIDEO_BRANCHES.find(([id])=>id===key)?.[1]||'Vidéo';
// Categories open with the echelon, on every page that shows them: the
// videography, the Loges virtuelles and an AS's videography. Métacognition and
// Ma société harmonieuse come with Game Master Blanc; Idées et projets opens
// at 24 (Game Master Blanc II) and Réflexions at 30 (Game Master Blanc III).
export const BRANCH_LEVELS={self:15,society:15,projects:24,ideas:30};
export const branchLevel=key=>BRANCH_LEVELS[key]??Infinity;
export const branchOpen=(key,level)=>Number(level)>=branchLevel(key);
export const openBranches=level=>VIDEO_BRANCHES.map(([id])=>id).filter(id=>branchOpen(id,level));
// An AS's videography shows the categories both members have reached.
export const sharedBranches=(viewerLevel,ownerLevel)=>openBranches(Math.min(Number(viewerLevel)||0,Number(ownerLevel)||0));
// Game Master Blanc grows in three tiers, one per opening of a category.
export const GAME_MASTER_BLANC_TIERS=[15,24,30];
export const gameMasterBlancTier=level=>GAME_MASTER_BLANC_TIERS.filter(min=>Number(level)>=min).length;
// « Ma version harmonieuse » now belongs to Métacognition: its retired
// category was stored under the old 'monthly' value, which nothing uses any
// more. Stored and public category keys are therefore the same.
const STORED_BRANCHES={};
export const storedVideoBranch=key=>STORED_BRANCHES[key]||key;
export const videoBranchKey=stored=>Object.keys(STORED_BRANCHES).find(key=>STORED_BRANCHES[key]===stored)||stored;
// The Loge has one room per shareable category. Métacognition stays private
// to the videography. Older posts carry no
// category and live in the first room.
export const LOGE_ROOMS=['ideas','projects','society'];
export const logeRoom=category=>LOGE_ROOMS.includes(category)?category:LOGE_ROOMS[0];
// The loges a member has reached, and the one a visit opens on: the newest
// category they reached first.
export const openLogeRooms=level=>LOGE_ROOMS.filter(room=>branchOpen(room,level));
export const defaultLogeRoom=level=>openLogeRooms(level)[0]||null;
// A loge gathers every Game Master Blanc's videos: its name is shared, unlike
// the personal names of the videography categories.
const LOGE_ROOM_LABELS={ideas:'Réflexions',projects:'Idées et projets',society:'Sociétés harmonieuses'};
export const logeRoomLabel=room=>LOGE_ROOM_LABELS[logeRoom(room)];


// One icon for every « expansion harmonieuse », in the Loges and between AS:
// a speech bubble holding a small four-point star.
export const EXPANSION_ICON_PATHS='<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z"/><path style="fill:currentColor;stroke:none" d="M12 6.6c.35 1.85 1.4 2.9 3.25 3.25-1.85.35-2.9 1.4-3.25 3.25-.35-1.85-1.4-2.9-3.25-3.25C10.6 9.5 11.65 8.45 12 6.6Z"/>';
export const expansionIcon=()=>`<svg viewBox="0 0 24 24" aria-hidden="true">${EXPANSION_ICON_PATHS}</svg>`;
