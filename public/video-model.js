export const VIDEO_BRANCHES=[
  ['self','Observations et améliorations de soi'],
  ['ideas','Idées et réflexions'],
  ['projects','Projets'],
  ['monthly','Bilan du mois'],
];
export const videoLabel=key=>VIDEO_BRANCHES.find(([id])=>id===key)?.[1]||'Vidéo';
