# Chantier Kambo — Service volontaires

Application de gestion des volontaires pour la rénovation de la Salle du Royaume
(assemblées Kambo Logement et Kambo Pariso).

- **Front** : React + TypeScript (Vite) → Cloudflare Pages → `https://volontaires.sallekambo.org`
- **API** : FastAPI + SQLAlchemy + Alembic → Dokploy → `https://api.sallekambo.org`
- **Base** : PostgreSQL (service Dokploy)

## Fonctionnalités (phase 1)

| Pour qui | Page | Ce qu'elle fait |
|---|---|---|
| Volontaires | `/` | Inscription sans compte : nom, WhatsApp, assemblée, compétences, grille des jours (lun → sam). Chaque jour affiche combien de volontaires sont déjà prévus. |
| Volontaires | `/moi/<lien>` | Lien personnel pour modifier ses jours à tout moment. |
| Équipe | `/admin` | Couverture par jour (jauge sur le plafond de 50), repas à prévoir, répartition par assemblée et compétence, liste nominative, message WhatsApp du jour à copier. |
| Responsable + adjoints | `/admin/volontaires` | Recherche, filtres, saisie manuelle, désactivation, nouveau lien, export CSV (Excel). |
| Responsable + adjoints + hommes clés | `/admin/messages` | Messages WhatsApp : à tous, aux volontaires d'un jour (attendus / réserve), à une assemblée ou à ses recrues. Modèles, champs personnalisés, publication dans la communauté ou un groupe, envoi un par un avec suivi, numéros et contacts (.vcf). |
| Responsable | `/admin/reglages` | Dates, plafond, jours fermés, compétences, comptes de l'équipe. |

**Rôles** :

| Rôle | Peut |
|---|---|
| `responsable` | Tout, y compris réglages, comptes, e-mails, suppression |
| `adjoint` | Gérer les volontaires, listes du jour, export CSV, journal |
| `relais` (« Homme clé ») | Inscrire, modifier et désactiver des volontaires (les deux assemblées), voir les téléphones et les listes du jour — sans export, journal, suppression ni réglages |
| `cuisine`, `comite` | Voir les effectifs par jour uniquement |

**Mineurs** : seuls les adultes peuvent s'inscrire (case « J'ai 18 ans ou plus » obligatoire, contrôlée
par l'API). Un volontaire peut indiquer le nombre de mineurs à sa charge qui pourraient l'accompagner :
ils apparaissent dans la couverture du jour (« + N mineurs accompagnés »), sont comptés dans les repas
à prévoir (hors volontaires en réserve), dans la liste nominative, le message WhatsApp du jour et l'export.

**Messages WhatsApp** : l'application ne peut pas envoyer seule de messages WhatsApp (aucune API
gratuite) ; elle prépare tout et ouvre WhatsApp, message déjà écrit. Deux façons d'envoyer :
*dans la communauté ou un groupe* (un message pour tous, `{prénom}` devient « à tous ») ou *un par
un* (message personnalisé avec `{prénom}`, `{jour}`, `{créneau}`, `{lien}`, `{communauté}` ; la liste
retient qui l'a reçu sur l'appareil). Chaque envoi est tracé dans le journal. Un homme clé n'écrit qu'à
ses recrues. Le lien d'invitation de la communauté WhatsApp (Réglages → Chantier) est proposé aux
volontaires après l'inscription et sur leur page personnelle.

**Fin du projet** (Réglages → Fin du projet, responsable uniquement) : à la fin du chantier, effacer
les données personnelles. *Anonymiser* (recommandé) supprime noms, numéros, remarques, liens personnels
et journal en gardant les chiffres anonymes (couverture, présents, analyses) ; *Tout effacer* ne garde
que les réglages. Options : supprimer les comptes de l'équipe, fermer les inscriptions, effacer la
configuration e-mail. Confirmation par le mot « EFFACER » et le mot de passe ; export proposé avant.
Penser à supprimer aussi les anciennes sauvegardes (R2). Désactivé dans la démo.

**Jours passés figés** (Réglages, activé par défaut) : les volontaires ne peuvent plus modifier les
jours antérieurs à aujourd'hui ; l'équipe peut toujours corriger depuis la fiche.

**Présents constatés et analyses** (facultatif) : chaque jour passé, on peut indiquer le nombre
approximatif d'adultes (et de mineurs) réellement présents, avec une note. Saisie par les responsables
et adjoints dans la fiche du jour (Couverture), ou par les personnes désignées via le lien dédié
`/presences`, protégé par un mot de passe défini dans Réglages → Saisie des présences (elles ne voient
que les jours et les nombres prévus, aucun nom). L'onglet **Analyses** montre le taux de présence réel,
le taux par jour de la semaine, un graphique prévus / présents et les **présents et repas probables**
pour les jours à venir (taux du jour de la semaine dès 2 jours renseignés, sinon taux global).

**Plafond et mineurs** : la case « Compter les mineurs accompagnés dans le plafond » (Réglages →
Chantier) fait occuper 1 + N places à un volontaire venant avec N mineurs.

**Code d'accès au formulaire** (Réglages → Accès au formulaire d'inscription, responsable) : une fois
activé, `volontaires.sallekambo.org` demande un code avant d'afficher le formulaire, et l'API refuse
toute inscription sans ce code (10 essais par minute et par IP). Bouton « Générer » et message
WhatsApp « lien + code » prêt à envoyer. Seuls les liens personnels des volontaires déjà inscrits
(`/moi/…`) restent accessibles sans code ; les liens de recrutement (`/?r=…`) exigent aussi le code
(leur message de partage l'inclut automatiquement).

**Lien de recrutement** : chaque membre de l'équipe (responsable, adjoint, homme clé) a un lien
personnel `/?r=CODE` (Réglages → Mon lien de recrutement). Les volontaires inscrits par ce lien, et
ceux saisis directement par un homme clé, lui sont rattachés (le nom du recruteur n'est jamais
affiché aux volontaires) : filtre « Mes recrues », compteur dans
la liste des comptes, mention « recruté par … » sur la fiche.

**Comptes de l'équipe** (Réglages, responsable uniquement) :
- **Invitation** : nom + rôle (+ e-mail facultatif). L'app génère un lien à usage unique valable 72 h,
  envoyé par e-mail si l'envoi est activé, sinon transmis par WhatsApp. La personne choisit elle-même
  son mot de passe.
- **Lien de réinitialisation** (bouton « Lien mot de passe ») : valable 1 h, usage unique.
- **Mot de passe oublié ?** sur la page de connexion : disponible dès que l'envoi d'e-mails est activé.
- Tout changement de mot de passe déconnecte les autres sessions du compte.

**Envoi d'e-mails** (Réglages → Envoi d'e-mails) : préréglages Brevo, Resend, Gmail ou SMTP
personnalisé, bouton d'e-mail de test. Le mot de passe SMTP est chiffré en base avec une clé
dérivée de `JWT_SECRET` (si vous changez `JWT_SECRET`, ressaisissez-le).

**Plafond** : au-delà de 50 inscrits sur un jour, les derniers engagés sur ce jour passent
automatiquement en **réserve** (ordre d'engagement conservé même quand on modifie ses autres jours).

---

## Installation et déploiement

Tout est décrit pas à pas dans **[docs/INSTALLATION.md](docs/INSTALLATION.md)**,
et la configuration Cloudflare (domaine, DNS, SSL, Pages, R2) dans **[docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)** :

| Environnement | Front | API |
|---|---|---|
| Production | `https://volontaires.sallekambo.org` (Cloudflare Pages) | `https://api.sallekambo.org` (Dokploy + PostgreSQL) |
| Démonstration | `https://demo.sallekambo.org` (Cloudflare Pages, `VITE_DEMO=1`) | `https://api-demo.sallekambo.org` (Dokploy, `DEMO=1`, SQLite) |

Modèles de variables : `backend/.env.example`, `backend/demo.env.example`,
`frontend/.env.example`, `frontend/demo.env.example`.

Mise à jour : `git push` sur `main` redéploie automatiquement les quatre services.

## Notes techniques

- Le lien personnel (`/moi/<token>`) est le seul accès d'un volontaire : en cas de perte,
  un adjoint le renvoie depuis la fiche (bouton WhatsApp) ou en génère un nouveau.
- Téléphones normalisés au format international (`677…` → `+237677…`) : un même numéro
  ne peut pas s'inscrire deux fois.
- Limitation anti-abus en mémoire : 20 requêtes/min/IP sur les routes publiques,
  10 tentatives de connexion/min/IP (`RATE_LIMIT_PUBLIC`, `RATE_LIMIT_LOGIN`).
- L'API refuse de démarrer sur PostgreSQL si `JWT_SECRET` fait moins de 32 caractères.
- Tests : `pytest` (SQLite, 33 tests) ou `TEST_DATABASE_URL=postgresql://… pytest` (PostgreSQL).

## Phase 2 (prévue)

Besoins par compétence d'après le planning du LDC, affectations aux équipes, gestion
active de la réserve, pointage sur le chantier, vue cuisine dédiée (J+1 / J+2).
