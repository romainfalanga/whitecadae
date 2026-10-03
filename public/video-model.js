export const VIDEO_BRANCHES=[
  ['self','Observations et améliorations de soi'],
  ['ideas','Idées et réflexions'],
  ['projects','Projets'],
  ['society','Ma société harmonieuse'],
  ['monthly','Bilan du mois'],
];
export const videoLabel=key=>VIDEO_BRANCHES.find(([id])=>id===key)?.[1]||'Vidéo';
