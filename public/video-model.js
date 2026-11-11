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

