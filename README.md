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
| Responsable | `/admin/reglages` | Dates, plafond, jours fermés, compétences, comptes de l'équipe. |

**Rôles** :

| Rôle | Peut |
|---|---|
| `responsable` | Tout, y compris réglages, comptes, e-mails, suppression |
| `adjoint` | Gérer les volontaires, listes du jour, export CSV, journal |
| `relais` (« Homme clé ») | Inscrire, modifier et désactiver des volontaires (les deux assemblées), voir les téléphones et les listes du jour — sans export, journal, suppression ni réglages |
| `cuisine`, `comite` | Voir les effectifs par jour uniquement |

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

## Développement local

```bash
# API
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export ADMIN_EMAIL=vous@exemple.com ADMIN_PASSWORD=motdepasse123
alembic upgrade head          # crée dev.db (SQLite)
uvicorn app.main:app --reload # http://localhost:8000/docs
pytest                        # 24 tests

# Front (autre terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (API attendue sur localhost:8000)
```

---

## Déploiement

### 1. Base de données PostgreSQL (Dokploy)

1. Dans votre projet Dokploy : **Create Service → Database → PostgreSQL**.
2. Nom : `volontaires-db`, base `volontaires`, utilisateur `volontaires`, mot de passe solide.
3. **Deploy**. Notez l'**Internal Connection URL** (du type
   `postgresql://volontaires:…@volontaires-db-xxxx:5432/volontaires`).
4. Onglet **Backups** : activez une sauvegarde quotidienne (vers S3 ou Cloudflare R2).
   Le recensement ne doit pas être perdu en plein chantier.

### 2. API FastAPI (Dokploy)

1. **Create Service → Application** → source Git (le dépôt) ou upload.
2. **Build Type : Dockerfile**, **Build path / context : `backend`**, Dockerfile : `Dockerfile`.
3. **Environment** (voir `backend/.env.example`) :
   ```
   DATABASE_URL=<Internal Connection URL de l'étape 1>
   JWT_SECRET=<chaîne aléatoire de 48+ caractères : openssl rand -hex 32>
   CORS_ORIGINS=https://volontaires.sallekambo.org
   ADMIN_EMAIL=lwilly32@gmail.com
   ADMIN_PASSWORD=<mot de passe du premier compte responsable>
   ADMIN_NOM=Willy
   ```
4. **Domains** : `api.sallekambo.org`, port conteneur **8000**, HTTPS activé (Let's Encrypt).
5. **Deploy**. Au démarrage, le conteneur applique les migrations (`alembic upgrade head`)
   puis crée le compte responsable s'il n'existe aucun compte.
6. Vérifiez : `https://api.sallekambo.org/api/health` → `{"status":"ok"}`.

> `ADMIN_PASSWORD` ne sert qu'au tout premier démarrage. Changez ensuite le mot de passe
> dans **Réglages → Mon mot de passe**.

### 3. DNS Cloudflare

Dans Cloudflare → `sallekambo.org` → **DNS** :

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `api` | IP du VPS | **DNS only (nuage gris)** au départ |

Laissez le nuage **gris** le temps que Dokploy obtienne son certificat Let's Encrypt.
Ensuite, vous pouvez passer en **orange (proxied)**, mais réglez alors
**SSL/TLS → Mode : Full (strict)** pour éviter les boucles de redirection.

L'enregistrement `volontaires` est créé automatiquement à l'étape 4.

### 4. Front (Cloudflare Pages, plan gratuit)

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** (ou *Direct Upload* du dossier `dist`).
2. Réglages de build :
   - Framework preset : **Vite** (ou *None*)
   - Root directory : **`frontend`**
   - Build command : **`npm run build`**
   - Output directory : **`dist`**
3. **Variables d'environnement (Production)** : `VITE_API_URL=https://api.sallekambo.org`
   (variable lue **au moment du build** : redéployez après l'avoir modifiée).
4. **Custom domains** → `volontaires.sallekambo.org`.
5. Pour économiser le quota de builds (500/mois par compte), dans
   **Settings → Builds → Branch control**, désactivez les déploiements de preview.

Le routage des pages (`/moi/…`, `/admin/…`) fonctionne nativement : Cloudflare Pages
renvoie `index.html` pour les chemins inconnus quand il n'y a pas de `404.html`.

### 5. Mise en service

1. Ouvrez `https://volontaires.sallekambo.org/admin`, connectez-vous.
2. **Réglages** : vérifiez les dates (par défaut 23/11/2026 → 23/01/2027), les jours
   fermés (25/12 et 01/01), le plafond (50), les compétences.
3. Créez les comptes des adjoints (rôle *Adjoint*), de la cuisine et du comité.
4. Diffusez le lien `https://volontaires.sallekambo.org` dans les groupes WhatsApp.

---

## Notes techniques

- Le lien personnel (`/moi/<token>`) est le seul accès d'un volontaire : en cas de perte,
  un adjoint le renvoie depuis la fiche (bouton WhatsApp) ou en génère un nouveau.
- Téléphones normalisés au format international (`677…` → `+237677…`) : un même numéro
  ne peut pas s'inscrire deux fois.
- Limitation anti-abus en mémoire : 20 requêtes/min/IP sur les routes publiques,
  10 tentatives de connexion/min/IP (`RATE_LIMIT_PUBLIC`, `RATE_LIMIT_LOGIN`).
- L'API refuse de démarrer sur PostgreSQL si `JWT_SECRET` fait moins de 32 caractères.
- Tests : `pytest` (SQLite) ou `TEST_DATABASE_URL=postgresql://… pytest` (PostgreSQL).

## Phase 2 (prévue)

Besoins par compétence d'après le planning du LDC, affectations aux équipes, gestion
active de la réserve, pointage sur le chantier, vue cuisine dédiée (J+1 / J+2).
