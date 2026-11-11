export const VIDEO_BRANCHES=[
  ['self','Métacognition'],
  ['ideas','Réflexions'],
  ['projects','Idées et projets'],
  ['version','Ma version harmonieuse'],
  ['society','Ma société harmonieuse'],
];
export const videoLabel=key=>VIDEO_BRANCHES.find(([id])=>id===key)?.[1]||'Vidéo';
// life_events.video_branch only accepts its five original values, and the
// table cannot be rebuilt without firing its cascading foreign keys. The
// 'version' category is therefore stored under the retired 'monthly' value,
// which migration 0040 emptied. The API and the client only ever see 'version'.
const STORED_BRANCHES={version:'monthly'};
export const storedVideoBranch=key=>STORED_BRANCHES[key]||key;
export const videoBranchKey=stored=>Object.keys(STORED_BRANCHES).find(key=>STORED_BRANCHES[key]===stored)||stored;
// The Loge has one room per shareable category. Métacognition and « Ta version
// harmonieuse » stay private to the videography. Older posts carry no
// category and live in the first room.
export const LOGE_ROOMS=['ideas','projects','society'];
export const logeRoom=category=>LOGE_ROOMS.includes(category)?category:LOGE_ROOMS[0];
// A loge gathers every Game Master Blanc's videos: its name is shared, unlike
// the personal names of the videography categories.
const LOGE_ROOM_LABELS={ideas:'Réflexions',projects:'Idées et projets',society:'Sociétés harmonieuses'};
export const logeRoomLabel=room=>LOGE_ROOM_LABELS[logeRoom(room)];


// One icon for every « expansion harmonieuse », in the Loges and between AS:
// a speech bubble holding a small four-point star.
export const EXPANSION_ICON_PATHS='<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z"/><path style="fill:currentColor;stroke:none" d="M12 6.6c.35 1.85 1.4 2.9 3.25 3.25-1.85.35-2.9 1.4-3.25 3.25-.35-1.85-1.4-2.9-3.25-3.25C10.6 9.5 11.65 8.45 12 6.6Z"/>';
export const expansionIcon=()=>`<svg viewBox="0 0 24 24" aria-hidden="true">${EXPANSION_ICON_PATHS}</svg>`;
