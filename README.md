# Pioche 7

Jeu de cartes « stop ou encore » pour mobile : tu joues contre 3 robots et tu essaies d'aligner 7 numéros différents sans tirer de doublon. C'est une application web installable (PWA) : plein écran, hors ligne, sauvegarde automatique.

Deux versions au choix (menu ou accueil, « Version ») : **Normale** et **Vengeance** (malus et coups bas). Dans le menu, « Mon profil » permet de choisir ton nom et ton avatar parmi 9 personnages.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'écran (table, menu, accueil) |
| `css/style.css` | Base du visuel : cartes, boutons, mise en page, animations |
| `css/theme.css` | Thème « soirée jeux » : nuit étoilée, tapis vert, pop-ups à ruban, podium |
| `css/vengeance.css` | Cartes de la version Vengeance, choix de carte, écran de profil |
| `js/engine.js` | Règles des deux versions, scores et intelligence des robots (sans affichage) |
| `js/avatars.js` | Personnages illustrés (les 3 robots et 9 avatars au choix) et leurs expressions |
| `js/app.js` | Interface, animations, sons, sauvegarde, journal, historique |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installation sur le téléphone et mode hors ligne |
| `tools/serve.js` | Petit serveur local pour tester sur l'ordinateur |
| `tools/gen-icons.js` | Régénère les icônes PNG |

## Tester sur l'ordinateur

```powershell
node tools/serve.js
```

Puis ouvre http://localhost:5177 dans Chrome (touche F12, puis l'icône téléphone pour voir le format mobile).

## Installer sur un téléphone Android

Pour être installable, l'application doit être en ligne en **HTTPS**. Deux solutions gratuites :

**Netlify Drop (le plus simple, sans compte développeur)**
1. Va sur https://app.netlify.com/drop
2. Glisse le dossier `Flip7` entier dans la page.
3. Ouvre l'adresse obtenue (`https://….netlify.app`) dans Chrome sur le téléphone.

**GitHub Pages**
1. Mets le dossier dans un dépôt GitHub.
2. Settings → Pages → Branch `main` / dossier racine.
3. Ouvre `https://<compte>.github.io/<dépôt>/` sur le téléphone.

Ensuite, sur le téléphone, dans Chrome : menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »). Le bouton « Installer l'application » apparaît aussi sur l'écran d'accueil du jeu quand Chrome le propose. Après la première ouverture, le jeu fonctionne sans connexion.

## Règles appliquées

- 94 cartes : numéros 0 à 12 (autant d'exemplaires que la valeur, un seul 0), bonus +2/+4/+6/+8/+10, un ×2, 3 STOP, 3 TROIS À LA SUITE, 3 SECONDE CHANCE.
- Distribution d'une carte à chacun, puis tour par tour : piocher ou arrêter.
- Doublon = 0 point pour la manche, sauf avec une Seconde chance (le doublon et la Seconde chance sont défaussés).
- STOP et TROIS À LA SUITE se donnent à un joueur encore en jeu (soi-même compris). Les actions tirées pendant un TROIS À LA SUITE sont jouées après les 3 cartes.
- Une seule Seconde chance à la fois : la suivante est donnée à un autre joueur, ou défaussée s'il n'y a personne.
- Score : somme des numéros, ×2 si la carte ×2, + bonus, +15 pour 7 numéros différents (la manche s'arrête aussitôt).
- La partie se termine à la fin de la manche où quelqu'un atteint 200 points ; le plus haut total gagne (en cas d'égalité en tête, on joue une manche de plus).
- La pioche n'est pas remélangée entre les manches : la défausse ne revient que quand la pioche est vide.

## Règles de la version Vengeance

D'après la règle de « Flip 7: With a Vengeance » (The Op), publiée en français sous le nom « Flip 7 Vengeance ». Les noms français des cartes spéciales sont des traductions maison.

- 108 cartes : numéros 0 à 13 (autant d'exemplaires que la valeur, un seul 0), malus −2/−4/−6/−8/−10 et ÷2, et 2 exemplaires de chaque action : ENCORE UNE !, QUATRE À LA SUITE, VOL, ÉCHANGE, DÉFAUSSE.
- S'arrêter ne protège pas : un joueur arrêté peut encore être visé jusqu'à la fin de la manche. Seuls les joueurs éliminés sont hors d'atteinte.
- **Zéro maudit** (le 0) : score de manche à 0 sauf avec 7 numéros ; tant qu'on l'a, on ne peut pas s'arrêter.
- **7 de la malchance** (un des 7) : défausse toutes les autres cartes (numéros et malus) de celui qui le reçoit ; il ne fait jamais sauter.
- **13 porte-bonheur** (un des 13) : autorise deux 13 (les deux comptent) ; un troisième fait sauter.
- Malus : celui qui le pioche le donne à un joueur non éliminé (à lui-même seulement s'il est seul).
- ENCORE UNE ! : la cible pioche 1 carte puis doit s'arrêter. QUATRE À LA SUITE : la cible pioche 4 cartes ; actions et malus tirés sont joués ensuite, dans l'ordre, sauf si elle a sauté ou fait 7 numéros.
- VOL : prendre une carte devant un adversaire. ÉCHANGE : échanger deux cartes de deux joueurs différents. DÉFAUSSE : retirer une carte de n'importe quel joueur non éliminé. Un doublon créé ainsi fait sauter. Sans cible possible, la carte est défaussée.
- Score : somme des numéros → ÷2 arrondi en dessous → − malus → minimum 0 → +15 pour 7 numéros.
- Non repris : le mode optionnel « Brutal » de la règle.

## Robots

- **Facile** : s'arrête à un seuil au hasard, vise au hasard.
- **Moyen** : estime le risque de doublon d'après les cartes visibles, prudent.
- **Difficile** : compte exactement les cartes restantes, calcule l'espérance de gain, prend plus de risques quand il est mené et vise le joueur le plus menaçant.

En simulation sur 2 000 parties (Facile, Moyen, Difficile, Moyen) : 7 %, 28 %, 36 % et 28 % de victoires.
