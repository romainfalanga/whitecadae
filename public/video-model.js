export const VIDEO_BRANCHES=[
  ['self','Observations et améliorations de soi'],
  ['ideas','Réflexions'],
  ['projects','Idées et projets'],
];
export const videoLabel=key=>VIDEO_BRANCHES.find(([id])=>id===key)?.[1]||'Vidéo';
