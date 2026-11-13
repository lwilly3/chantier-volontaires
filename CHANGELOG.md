# Journal des versions

Ce qui change d'une version à l'autre. Les numéros suivent la forme `MAJEURE.MINEURE.CORRECTIF` :

- **correctif** (1.0.0 → 1.0.1) : corrections, sans rien de nouveau à apprendre ;
- **mineure** (1.0.0 → 1.1.0) : nouveautés, sans rien casser ;
- **majeure** (1.0.0 → 2.0.0) : changement qui demande une action à l'installation (variable à ajouter,
  manipulation de la base…), expliquée dans les notes.

Chaque version est téléchargeable depuis la page
[Releases](https://github.com/lwilly3/chantier-volontaires/releases) du dépôt.
Pour publier une version : [docs/INSTALLATION.md § 6](docs/INSTALLATION.md#6-mettre-à-jour-lapplication).

## Non publié

- **Export en image** : les images du calendrier et de la grille des compétences rappellent l'état des
  inscriptions (total et détail par assemblée) sous le titre.

## [1.0.0] — 2026-11-13

Première version numérotée.

- **Volontaires** : inscription sans compte, grille des jours (journée, matin ou après-midi), lien
  personnel pour modifier ses jours, code d'accès facultatif, accord explicite sur les données.
- **Couverture** : calendrier coloré, plafond par jour et réserve automatique, repas à prévoir,
  répartition par assemblée et compétence, grille compétences × jours, export en image.
- **Équipe** : liste des volontaires (recherche, filtres, saisie manuelle, export CSV), messages
  WhatsApp ciblés avec modèles, présents constatés et analyses, hommes clés, journal paginé.
- **Réglages** : dates du chantier (avec annonce de l'impact d'un changement), assemblées, compétences,
  comptes et rôles.
- **Protection des données** : rôles sans accès aux noms, jours passés figés, mentions légales,
  anonymisation ou effacement en fin de projet.
- **Espace de démonstration** à données fictives, recréé chaque nuit.
- **Version affichée** en pied de page et dans `/api/health`.
