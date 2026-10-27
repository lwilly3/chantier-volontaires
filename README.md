# Volontaires

Application web libre pour organiser les **volontaires d'un chantier de rénovation de Salle du Royaume** :
inscription sans compte, disponibilités jour par jour, plafond de sécurité et réserve, rappels WhatsApp,
prévision des repas, présents constatés, analyses — puis effacement des données à la fin du chantier.

Pensée pour un service volontaires de quelques personnes, utilisée surtout sur téléphone, en français.

> **Projet indépendant et bénévole.** Il n'est ni édité, ni approuvé, ni financé, ni administré par la
> Watch Tower Bible and Tract Society of Pennsylvania ni par aucune organisation qui lui est liée.
> Chaque équipe qui l'utilise est responsable de ses données. Lire [NOTICE.md](NOTICE.md).

**Stack** : React + TypeScript (Vite) · FastAPI + SQLAlchemy + Alembic · PostgreSQL (SQLite en
développement). Déploiement de référence : front sur Cloudflare Pages (gratuit), API et base sur un VPS
avec Dokploy.

---

## Fonctionnalités

### Pour les volontaires (sans compte)
- **Inscription** en quelques minutes : nom, WhatsApp, assemblée, compétences, mineurs accompagnés,
  grille des jours (lundi → samedi) avec, pour chaque jour, le nombre de personnes déjà prévues.
- **Journée, matin ou après-midi** en touchant plusieurs fois un jour ; mode d'emploi intégré.
- **Lien personnel** (`/moi/…`) pour modifier ses jours à tout moment, à s'envoyer sur WhatsApp.
- **Code d'accès** facultatif avant le formulaire, **réservé aux adultes**, **accord explicite** sur
  l'utilisation des données, page **Mentions légales**.

### Pour l'équipe (`/admin`)
- **Couverture** : calendrier coloré selon le remplissage, plafond par jour (sécurité), **réserve
  automatique** au-delà, repas à prévoir, répartition par assemblée et compétence, liste du jour.
- **Volontaires** : recherche, filtres, saisie pour ceux qui n'ont pas de smartphone, export Excel (CSV).
- **Messages WhatsApp** : à tous, aux volontaires d'un jour (attendus / réserve), à une assemblée ou à
  ses recrues ; modèles et champs personnalisés (`{prénom}`, `{jour}`, `{créneau}`, `{lien}`) ;
  publication dans une communauté ou envoi un par un avec suivi.
- **Présents constatés** (facultatif) et **analyses** : taux de présence réel, présents et repas probables.
- **Hommes clés** : liens de recrutement personnels et suivi de leurs recrues.
- **Journal** de toutes les modifications.

### Protection des données
- Rôles : la cuisine et le comité ne voient **que des chiffres**, jamais les noms ni les numéros.
- **Jours passés figés** pour les volontaires (réglable).
- **Fin du projet** : anonymiser (les statistiques restent) ou tout effacer, en un geste, confirmé par
  mot de passe.
- **Démo** sans aucun vrai numéro de téléphone (numéros fictifs `+999…`).

### Rôles

| Rôle | Peut |
|---|---|
| Responsable | Tout : réglages, comptes, e-mails, export, suppression, fin du projet |
| Adjoint | Gérer les volontaires, listes du jour, messages, export, journal |
| Homme clé | Inscrire, modifier, désactiver des volontaires, listes du jour, écrire à ses recrues |
| Cuisine, Comité | Voir les effectifs par jour et les analyses (aucun nom) |

---

## Démarrage rapide (sur ton ordinateur)

Prérequis : Python 3.12+, Node.js 22+.

```bash
# API
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export ADMIN_EMAIL=toi@exemple.org ADMIN_PASSWORD=motdepasse123
alembic upgrade head            # crée dev.db (SQLite)
uvicorn app.main:app --reload   # http://localhost:8000/docs
pytest                          # tests

# Front (autre terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 → connexion : /admin
```

Pour essayer avec des données fictives (connexion en un clic par rôle), lance l'API en **mode démo** :
voir [docs/INSTALLATION.md § 9](docs/INSTALLATION.md#9-développement-local).

## Déploiement

Guide pas à pas : **[docs/INSTALLATION.md](docs/INSTALLATION.md)** (production, espace de démonstration,
variables, mises à jour, sauvegardes, dépannage) et **[docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)** (domaine,
DNS, SSL, Pages, R2).

| Élément | Production | Démonstration (facultative) |
|---|---|---|
| Front | Cloudflare Pages, `VITE_API_URL` | Cloudflare Pages, `VITE_DEMO=1` |
| API | Conteneur Docker (`backend/Dockerfile`) | Même image, `DEMO=1` |
| Base | PostgreSQL, sauvegardée | SQLite jetable, recréée chaque nuit |

Modèles de variables : `backend/.env.example`, `backend/demo.env.example`, `frontend/.env.example`,
`frontend/demo.env.example`. Les migrations de base s'appliquent automatiquement au démarrage de l'API.

Après l'installation, dans **Réglages** : nom et dates du chantier, assemblées, compétences, plafond par
jour, **responsable des données** (affiché dans les mentions légales), code d'accès, comptes de l'équipe.
Facultatif : `VITE_DEPOT_URL` pour que le lien « Code source » pointe vers ta copie du dépôt.

## Notes techniques

- Le lien personnel (`/moi/<token>`) est le seul accès d'un volontaire ; l'équipe peut le renvoyer ou en
  générer un nouveau depuis sa fiche.
- Téléphones normalisés au format international (`677…` → `+237677…` par défaut pour le Cameroun, voir
  `normaliser_telephone` dans `backend/app/services.py`) : un même numéro ne s'inscrit qu'une fois.
- Fuseau horaire du chantier : `TZ_CHANTIER` (défaut `Africa/Douala`).
- Limitation anti-abus en mémoire (`RATE_LIMIT_PUBLIC`, `RATE_LIMIT_LOGIN`).
- L'API refuse de démarrer sur PostgreSQL si `JWT_SECRET` fait moins de 32 caractères.
- Tests : `pytest` (SQLite) ou `TEST_DATABASE_URL=postgresql://… pytest` (PostgreSQL).

## Pistes d'évolution

Besoins par compétence selon le planning des travaux, affectation aux équipes, gestion active de la
réserve, pointage sur le chantier, autres formats de numéros de téléphone, traduction de l'interface.

## Contribuer

Les suggestions et corrections sont bienvenues : ouvre une *issue* ou une *pull request*.

- Lance les tests (`pytest` dans `backend`, `npm run build` dans `frontend`) avant de proposer un changement.
- **N'inclus jamais de données réelles de volontaires** (noms, numéros, captures d'écran) dans un ticket,
  un test ou une capture.
- L'interface tutoie et reste en français simple.

**Signaler une faille de sécurité** : n'ouvre pas d'issue publique ; utilise *Security → Report a
vulnerability* sur GitHub.

## Licence

Logiciel libre sous licence **[MIT](LICENSE)** : tu peux l'utiliser, le modifier et le redistribuer
librement, à condition de conserver la mention de copyright. Fourni sans garantie.
Avant toute utilisation, lire **[NOTICE.md](NOTICE.md)** (indépendance du projet et responsabilité de
chaque installation).
