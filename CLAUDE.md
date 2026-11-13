# Consignes pour les agents

Application de gestion des volontaires d'un chantier : API FastAPI (`backend/`), site React + Vite
(`frontend/`). Documentation d'installation et d'exploitation : `docs/INSTALLATION.md`.

## Versions : à faire à chaque push, sans attendre qu'on le demande

Un push sur `main` déclenche quatre déploiements (production et démo). Quand ce push contient un
changement de l'application, il doit aussi créer une version numérotée. C'est à l'agent de le faire,
automatiquement, au moment où l'utilisateur demande de pousser.

### 1. Pendant le travail : tenir le journal

Tout changement visible par un utilisateur ou par la personne qui installe l'application (nouveauté,
correction, changement de comportement, variable d'environnement, migration) reçoit une ligne dans la
section **« Non publié »** de `CHANGELOG.md`, dans le même commit que le changement.

Pas de ligne, et donc pas de version, pour ce qui ne change pas l'application en service :
documentation, tests, intégration continue, ce fichier, remise en forme du code sans effet visible.

### 2. Au moment de pousser : publier si le journal n'est pas vide

Quand l'utilisateur demande de pousser (« pousse », « envoie », « déploie »…) :

1. Lancer les tests (`cd backend && pytest`) et le build (`cd frontend && npm run build`). S'arrêter et
   le dire si l'un échoue.
2. Commiter tout le travail en attente.
3. Regarder la section « Non publié » de `CHANGELOG.md` :
   - **vide** : pousser simplement (`git push origin main`), sans version ;
   - **non vide** : publier une version, puis pousser avec les étiquettes :

     ```bash
     python3 scripts/publier_version.py <niveau>
     git push origin main --follow-tags
     ```

4. Après un push avec version, vérifier que la page de la version existe (`gh release view vX.Y.Z`).
   Si elle manque après une ou deux minutes, relancer le workflow :
   `gh workflow run version.yml -f etiquette=vX.Y.Z`.
5. Dire à l'utilisateur le numéro publié et ce qu'il contient.

### 3. Choisir le niveau

Le niveau se déduit des lignes de « Non publié » ; prendre le plus élevé qui s'applique.

| Niveau | Quand | Exemple |
|---|---|---|
| `correctif` | uniquement des corrections, rien de nouveau à apprendre | 1.2.0 → 1.2.1 |
| `mineure` | au moins une nouveauté, sans rien casser | 1.2.0 → 1.3.0 |
| `majeure` | une action est nécessaire à l'installation (variable à ajouter, manipulation de la base…) | 1.2.0 → 2.0.0 |

Une version `majeure` demande toujours la confirmation de l'utilisateur avant d'être publiée, et ses
notes doivent expliquer l'action à faire.

### 4. Ce qu'il ne faut pas faire

- Ne pas modifier à la main le numéro dans `backend/app/version.py` ou `frontend/package.json` : seul
  `scripts/publier_version.py` le fait.
- Ne pas créer, déplacer ni supprimer une étiquette `vX.Y.Z` à la main, et ne jamais republier un
  numéro déjà poussé : une erreur se corrige par une nouvelle version.
- Ne pas pousser ni publier de sa propre initiative : la version accompagne un push que l'utilisateur
  a demandé.

## Fichiers locaux

- `INSTALLATION.local.md` et `.claude/` sont ignorés par Git (valeurs propres à la machine) : ne pas
  les commiter.
