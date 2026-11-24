# Pioche 7

Jeu de cartes « stop ou encore » pour mobile : tu joues contre 3 robots et tu essaies d'aligner 7 numéros différents sans tirer de doublon. C'est une application web installable (PWA) : plein écran, hors ligne, sauvegarde automatique.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'écran (table, menu, accueil) |
| `css/style.css` | Tout le visuel : tapis, cartes, boutons, animations |
| `js/engine.js` | Règles du jeu, scores et intelligence des robots (sans affichage) |
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

## Robots

- **Facile** : s'arrête à un seuil au hasard, vise au hasard.
- **Moyen** : estime le risque de doublon d'après les cartes visibles, prudent.
- **Difficile** : compte exactement les cartes restantes, calcule l'espérance de gain, prend plus de risques quand il est mené et vise le joueur le plus menaçant.

En simulation sur 2 000 parties (Facile, Moyen, Difficile, Moyen) : 7 %, 28 %, 36 % et 28 % de victoires.
