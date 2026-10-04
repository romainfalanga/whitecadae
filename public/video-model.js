export const VIDEO_BRANCHES=[
  ['self','Observation et amélioration de soi'],
  ['ideas','Réflexions'],
  ['projects','Idées et projets'],
];
export const videoLabel=key=>VIDEO_BRANCHES.find(([id])=>id===key)?.[1]||'Vidéo';
