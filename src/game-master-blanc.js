// Delivered only after the server has verified the player's final echelon.
//
// Game Master Blanc grows in three tiers, each opened by a video category:
// I from echelon 15 (Métacognition, Ma société harmonieuse), II from 24
// (Idées et projets), III from 30 (Réflexions). Each tier adds the section of
// its category after « Ta société harmonieuse » and rewrites the Loges
// virtuelles section for the loges it opens.
const OPENING=['Façonne ton paradis pour le rejoindre.','Deviens ton propre Game Master.'];
const VIDEOGRAPHY={title:'Vidéographie',paragraphs:[
  'Extériorise tes pensées en vidéo.',
  'Utilise ta vidéographie pour visualiser tes trajectoires de réflexion et choisir celles que tu veux voir grandir.'
]};
const METACOGNITION={title:'Métacognition',paragraphs:[
  'Observe tes propres pensées et extériorise dans ta vidéographie ce que tu comprends de la manière dont elles émergent. Imagine ta version harmonieuse et façonne-la pour la devenir.'
]};
const SOCIETY={title:'Ta société harmonieuse',paragraphs:[
  'Imagine une société harmonieuse et façonne-la dans ta vidéographie.',
  'Veille à ce que ta version harmonieuse soit cohérente avec cette société.'
]};
// The videography as a tool: put the ideas outside, watch them again, improve them.
const IDEAS_AND_PROJECTS={title:'Tes idées et tes projets',paragraphs:[
  'Extériorise tes idées et tes projets dans ta vidéographie.',
  'Revisualise tes vidéos pour prendre du recul sur eux et les améliorer.'
]};
const REFLECTIONS={title:'Tes réflexions',paragraphs:[
  'Extériorise tes réflexions dans ta vidéographie.',
  'Revisualise-les pour prendre du recul, les approfondir et suivre leur évolution.'
]};
const SHARE='Partage dans les Loges virtuelles tes meilleures pensées aux autres Game Masters Blancs.';
const DISAGREE='Quand tu n’es pas d’accord avec un autre Game Master Blanc, fais émerger les inconvénients que tu perçois dans le point de vue de l’autre pour affiner ensemble votre vision.';
const LOGES=[
  // I: one loge, Sociétés harmonieuses.
  {title:'Loges virtuelles',paragraphs:[
    SHARE,
    'Ces échanges vous permettent de grandir ensemble. Confrontez vos visions d’une société harmonieuse et aidez-vous à les faire grandir.',
    DISAGREE
  ]},
  // II: Idées et projets joins it.
  {title:'Loges virtuelles',paragraphs:[
    SHARE,
    'Ces échanges vous permettent de grandir ensemble. Enrichissez mutuellement vos visions et aidez-vous à les faire grandir de manière harmonieuse.',
    DISAGREE
  ]},
  // III: every loge, Réflexions included.
  {title:'Loges virtuelles',paragraphs:[
    SHARE,
    'Ces échanges vous permettent de grandir ensemble. Enrichissez mutuellement vos arborescences de réflexion et aidez-vous à les faire grandir de manière harmonieuse.',
    'Aidez-vous les uns les autres à développer et concrétiser vos idées et vos projets. '+DISAGREE
  ]}
];
const page=(tier,...added)=>({title:'Game Master Blanc',opening:OPENING,sections:[VIDEOGRAPHY,METACOGNITION,SOCIETY,...added,LOGES[tier-1]]});
export const GAME_MASTER_BLANC_PAGES=[
  page(1),
  page(2,IDEAS_AND_PROJECTS),
  page(3,IDEAS_AND_PROJECTS,REFLECTIONS)
];
export const GAME_MASTER_BLANC=GAME_MASTER_BLANC_PAGES[0];
// The tiers a member has reached, each with its page; the last is the current one.
export function gameMasterBlancTiers(tier){
  return GAME_MASTER_BLANC_PAGES.slice(0,Math.max(1,Math.min(tier,GAME_MASTER_BLANC_PAGES.length))).map((content,index)=>({tier:index+1,page:content}));
}
