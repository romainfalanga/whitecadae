// Delivered only after the server has verified the player's final echelon.
export const GAME_MASTER_BLANC = {
  title:'Game Master Blanc',
  opening:['Façonne ton paradis pour le rejoindre.','Deviens ton propre Game Master.'],
  sections:[
    {title:'Vidéographie',paragraphs:[
      'Extériorise tes pensées en vidéo.',
      'Utilise ta vidéographie pour visualiser tes trajectoires de réflexion et choisir celles que tu veux voir grandir.'
    ]},
    {title:'Métacognition',paragraphs:[
      'Observe tes propres pensées et extériorise dans ta vidéographie ce que tu comprends de la manière dont elles émergent. Imagine ta version harmonieuse et façonne-la pour la devenir.'
    ]},
    {title:'Ta société harmonieuse',paragraphs:[
      'Imagine une société harmonieuse et façonne-la dans ta vidéographie.',
      'Veille à ce que ta version harmonieuse soit cohérente avec cette société.'
    ]},
    {title:'Loges virtuelles',paragraphs:[
      'Partage dans les Loges virtuelles tes meilleures pensées aux autres Game Masters Blancs.',
      'Ces échanges vous permettent de grandir ensemble. Enrichissez mutuellement vos arborescences de réflexion et aidez-vous à les faire grandir de manière harmonieuse.',
      'Aidez-vous les uns les autres à développer et concrétiser vos idées et vos projets. Quand tu n’es pas d’accord avec un autre Game Master Blanc, fais émerger les inconvénients que tu perçois dans le point de vue de l’autre pour affiner ensemble votre vision.'
    ]}
  ]
};

// Game Master Blanc grows in three tiers, each opened by a video category:
// Idées et projets at echelon 24 (II), Réflexions at 30 (III). A tier is the
// first page with the new category's section after « Ta société harmonieuse ».
const IDEAS_AND_PROJECTS={title:'Tes idées et tes projets',paragraphs:[
  'Fais émerger tes idées et tes projets, et extériorise-les dans ta vidéographie.',
  'Choisis ceux qui rapprochent le monde de ta société harmonieuse et fais-les grandir jusqu’à les concrétiser.'
]};
const REFLECTIONS={title:'Tes réflexions',paragraphs:[
  'Extériorise dans ta vidéographie tes réflexions sur le monde qui t’entoure.',
  'Confronte-les à ta version harmonieuse et à ta société harmonieuse pour affiner ta vision.'
]};
const withAfterSociety=(page,...added)=>{
  const at=page.sections.findIndex(section=>section.title==='Ta société harmonieuse')+1;
  return {...page,sections:[...page.sections.slice(0,at),...added,...page.sections.slice(at)]};
};
export const GAME_MASTER_BLANC_PAGES=[
  GAME_MASTER_BLANC,
  withAfterSociety(GAME_MASTER_BLANC,IDEAS_AND_PROJECTS),
  withAfterSociety(GAME_MASTER_BLANC,IDEAS_AND_PROJECTS,REFLECTIONS)
];
// The tiers a member has reached, each with its page; the last is the current one.
export function gameMasterBlancTiers(tier){
  return GAME_MASTER_BLANC_PAGES.slice(0,Math.max(1,Math.min(tier,GAME_MASTER_BLANC_PAGES.length))).map((page,index)=>({tier:index+1,page}));
}

