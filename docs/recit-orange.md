# Accueil Orange et espaces communautaires

L’accueil conserve les trois paragraphes, adaptés à 57 (quatre morceaux) et 114 (trois morceaux). Les accès acquis apparaissent ensuite dans l’ordre des échelons. La grille actuelle, les signes et le lecteur sont documentés dans parcours-aa-conversation.md.

Conversation conserve un fil commun et deux thèmes : Général et Indice. Les anciennes publications Interprétations et Idées deviennent Général, sans modifier leur seuil ni leur version de permissions. Les filtres de lecture sont indépendants des options de publication. Le formulaire reste à l’écran, et le fil défile entre les filtres et le formulaire.

Vidéographie utilise des tables vg_posts, vg_comments et vg_media créées à la première requête autorisée. Aucun ancien arbre privé ni récapitulatif n’est importé. Les seuils sont vérifiés sur les listes, détails, commentaires et fichiers. Abaisser le seuil d’une vidéo ayant des réponses est interdit pour préserver leur audience. Les suppressions de publications et réponses sont logiques et leurs médias deviennent inaccessibles.

Le bucket R2 privé whitecadae-media est lié au Worker par MEDIA. Vidéos : MP4, WebM ou QuickTime lisible par le navigateur, dix minutes / 80 Mo ; liens YouTube également acceptés. Les liens externes conservent la visibilité décidée sur YouTube. R2 sert les fichiers via le Worker authentifié, avec Range et sans cache public. Pas de transcodage vidéo côté serveur.

Les vocaux (trois minutes / 8 Mo) passent par la réduction de bruit du navigateur, l’égalisation et la compression existantes avant envoi et transcription Workers AI. Les brouillons audio et texte sont conservés dans IndexedDB. La correction du texte conserve les repères des mots inchangés et interpole les mots modifiés. Les minutages proviennent des mots ou segments retournés par la transcription ; ils sont approximatifs dans les segments. La préécoute permet de les vérifier. Le lecteur parcourt les réponses en profondeur, conserve la voix réelle et affiche progressivement le texte ; un premier geste lance la lecture conformément aux navigateurs mobiles.

Limites serveur : dix vidéos et soixante réponses par jour (hors auteur) ; cent réservations de fichiers et 200 Mo par jour, 1 Go par membre et 8 Go de réserve globale. Trois tentatives de transcription par vocal. Une réservation abandonnée peut être retirée ; les brouillons restants comptent dans les limites. Les autorisations du compte et du serveur doivent être conservées à chaque évolution.
