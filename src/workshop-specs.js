// Only the currently accessible board's instructions and sources reach the client.
export const BOARD_SPECS={
  first:{prompt:'Une durée peut aussi se lire comme une date. Construis le jour et le mois.',slots:[{label:'Jour'},{label:'Mois'}]},
  pair:{prompt:'Deux durées, deux blocs à rapprocher. Les chiffres peuvent se séparer et les nombres se dupliquer.',slots:[{label:'Premier bloc'},{label:'Deuxième bloc'}]},
  last:{prompt:'Sépare les chiffres, transforme-les puis assemble ta lecture dans un seul bloc.',slots:[{label:'Nombre'}]},
  album:{prompt:'Quel lien unit le nombre de cet album à celui qui le précède ? Répartir garde ensemble le nombre de groupes et leur contenu.',format:'album',slots:[{label:'Nombre de l’album précédent · numéro de cet album'}]},
  date:{prompt:'Juillet est le septième mois : son bloc 07 est déjà placé. Que deviennent les autres nombres de la date ?',slots:[{label:'Nombre'},{label:'Mois',fixed:'d'}]},
  wanheda:{prompt:'Les minutes et les secondes peuvent se rencontrer dans un même nombre.',slots:[{label:'Nombre'}]},
  infinis:{prompt:'Ces deux morceaux partagent la même durée. Utilise les minutes comme nombre de groupes pour répartir les secondes. Chaque groupe devient un chiffre.',slots:[{label:'Chiffres répétés'}]},
};
