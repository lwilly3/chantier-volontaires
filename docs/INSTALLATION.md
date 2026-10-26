# Installation et configuration

Guide complet pour (ré)installer l'application **Service volontaires** : production et espace de
démonstration, front et API. À suivre dans l'ordre ; chaque étape se termine par une vérification.

Détail de toute la configuration Cloudflare (domaine, DNS, SSL, Pages, R2) : **[CLOUDFLARE.md](CLOUDFLARE.md)**.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Prérequis](#2-prérequis)
3. [Production](#3-production)
   - 3.1 Base PostgreSQL · 3.2 API · 3.3 DNS · 3.4 Front · 3.5 Mise en service
4. [Espace de démonstration](#4-espace-de-démonstration)
   - 4.1 API · 4.2 DNS · 4.3 Front · 4.4 Vérification
5. [Référence des variables](#5-référence-des-variables)
6. [Mettre à jour l'application](#6-mettre-à-jour-lapplication)
7. [Sauvegardes et restauration](#7-sauvegardes-et-restauration)
8. [Dépannage](#8-dépannage)
9. [Développement local](#9-développement-local)

---

## 1. Vue d'ensemble

Un seul dépôt Git, déployé quatre fois :

| Élément | Production | Démonstration |
|---|---|---|
| **Front** (React, Cloudflare Pages) | projet `volontaires-kambo` → `https://volontaires.sallekambo.org` | projet `volontaires-demo` → `https://demo.sallekambo.org` |
| **API** (FastAPI, Dokploy) | application de production (ex. `volontaires-api`) → `https://api.sallekambo.org` | application `volontaires-demo` → `https://api-demo.sallekambo.org` |
| **Base de données** | PostgreSQL (service Dokploy), **sauvegardée** | SQLite jetable dans le conteneur, recréée chaque nuit |
| **Données** | réelles | ~90 volontaires fictifs |
| **Connexion équipe** | e-mail + mot de passe | un clic par rôle |

```
navigateur ──► Cloudflare Pages (front statique)
     │
     └──────► api.sallekambo.org ──► VPS Dokploy (conteneur FastAPI) ──► PostgreSQL
```

- Le front est un site statique : il ne contient aucun secret. Son seul réglage est l'adresse de l'API,
  fixée **au moment du build** (`VITE_API_URL`).
- L'API applique elle-même les migrations de base de données à chaque démarrage (`alembic upgrade head`).
- Le domaine `sallekambo.org` est enregistré chez Cloudflare (registrar + DNS).
- VPS : `51.91.157.54`.

## 2. Prérequis

| Quoi | Où |
|---|---|
| Dépôt GitHub du projet (`lwilly3/…`) | GitHub, connecté à Dokploy et à Cloudflare Pages |
| Compte Cloudflare avec le domaine `sallekambo.org` | dash.cloudflare.com |
| VPS avec Dokploy installé | `http://51.91.157.54:3000` (ou l'adresse de ton panneau Dokploy) |
| Un fournisseur d'e-mail SMTP (facultatif) | Gmail avec mot de passe d'application, Brevo, etc. |

Générer un secret (à faire une fois par environnement, jamais le même pour la prod et la démo) :

```bash
openssl rand -hex 32
# ou
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 3. Production

### 3.1 Base de données PostgreSQL (Dokploy)

1. Dans le projet Dokploy : **Create Service → Database → PostgreSQL**.
2. Nom `volontaires-db`, base `volontaires`, utilisateur `volontaires`, mot de passe solide.
3. **Deploy**, puis copier l'**Internal Connection URL**
   (`postgresql://volontaires:…@volontaires-db-xxxx:5432/volontaires`).
4. Onglet **Backups** : activer une sauvegarde quotidienne (voir [§ 7](#7-sauvegardes-et-restauration)).

> L'URL `postgresql://…` est convertie automatiquement par l'API pour le pilote psycopg 3 :
> rien à modifier.

### 3.2 API FastAPI (Dokploy)

1. **Create Service → Application**, nom par exemple `volontaires-api`.
2. **Provider** : GitHub → le dépôt, branche `main`. Activer **Autodeploy** (déploiement à chaque push).
3. **Build Type** : `Dockerfile` · **Build Path** : `/backend` · Dockerfile : `Dockerfile`.
4. **Environment** (modèle : `backend/.env.example`) :
   ```env
   DATABASE_URL=<Internal Connection URL de l'étape 3.1>
   JWT_SECRET=<secret généré, 32 caractères minimum>
   CORS_ORIGINS=https://volontaires.sallekambo.org
   ADMIN_EMAIL=lwilly32@gmail.com
   ADMIN_PASSWORD=<mot de passe du premier compte responsable>
   ADMIN_NOM=Willy
   ```
5. **Domains** : hôte `api.sallekambo.org`, chemin `/`, **port du conteneur `8000`**,
   HTTPS activé, certificat **Let's Encrypt**.
6. **Deploy**. Les journaux doivent afficher `→ Migrations de la base de données` puis
   `Application startup complete`.

**Vérification** : `https://api.sallekambo.org/api/health` → `{"status":"ok"}`
(une fois le DNS de l'étape 3.3 en place).

> - `ADMIN_*` ne sert qu'au **tout premier démarrage**, quand aucun compte n'existe. Ensuite, changer le
>   mot de passe dans **Réglages → Mon mot de passe** ; modifier la variable n'a plus d'effet.
> - L'API refuse de démarrer sur PostgreSQL si `JWT_SECRET` fait moins de 32 caractères.
> - **Ne change pas `JWT_SECRET` en cours de chantier** : tout le monde serait déconnecté et le mot de
>   passe SMTP enregistré (chiffré avec une clé dérivée de ce secret) devrait être ressaisi.

### 3.3 DNS Cloudflare

> Détails des réglages : [CLOUDFLARE.md § 3–4](CLOUDFLARE.md#3-dns).

Cloudflare → `sallekambo.org` → **DNS → Enregistrements → Ajouter** :

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `api` | `51.91.157.54` | **DNS uniquement (nuage gris)** |

- Le nuage doit rester **gris** pour que Dokploy obtienne et renouvelle son certificat Let's Encrypt.
- Si un jour tu passes en orange (proxy), règle **SSL/TLS → Mode : Full (strict)** pour éviter les
  boucles de redirection.
- L'enregistrement `volontaires` n'est **pas** à créer à la main : Pages le crée à l'étape 3.4.

### 3.4 Front (Cloudflare Pages, plan gratuit)

> Détails : [CLOUDFLARE.md § 5](CLOUDFLARE.md#5-pages--site-de-production).

1. Cloudflare → **Workers & Pages → Créer**.
   ⚠️ L'écran propose d'abord un **Worker** : ne pas le déployer. Cliquer sur
   **« Vous cherchez Pages ? » → Importer un référentiel Git**.
2. Choisir le dépôt, branche de production `main`, nom du projet `volontaires-kambo`.
3. Paramètres de build :

   | Réglage | Valeur |
   |---|---|
   | Préréglage de framework | Aucun (ou Vite) |
   | Commande de build | `npm run build` |
   | Répertoire de sortie | `dist` |
   | Répertoire racine (avancé) | `frontend` |

4. **Variables d'environnement** (modèle : `frontend/.env.example`) :

   | Nom | Valeur |
   |---|---|
   | `VITE_API_URL` | `https://api.sallekambo.org` |
   | `NODE_VERSION` | `22` |

5. **Enregistrer et déployer**.
6. Projet → **Domaines personnalisés → Configurer un domaine** → `volontaires.sallekambo.org`.
   Cloudflare crée le CNAME tout seul ; le HTTPS est actif après quelques minutes.
7. Conseillé : **Paramètres → Builds → Contrôle des branches** → désactiver les déploiements de
   prévisualisation (quota de 500 builds/mois).

> Les variables `VITE_*` sont lues **pendant le build**. Après une modification : **Déploiements →
> Réessayer le déploiement** (ou pousser un commit).

**Vérification** : `https://volontaires.sallekambo.org` affiche l'écran du code d'accès ou le formulaire.

### 3.5 Mise en service

Se connecter sur `https://volontaires.sallekambo.org/admin/connexion` avec `ADMIN_EMAIL` /
`ADMIN_PASSWORD`, puis dans **Réglages** :

1. **Mon mot de passe** : remplacer le mot de passe initial.
2. **Paramètres du chantier** : dates (par défaut 23/11/2026 → 23/01/2027), jours fermés (25/12, 01/01),
   plafond par jour (50), seuil « presque plein » (45), assemblées, compétences, message d'accueil,
   prise en compte ou non des mineurs dans le plafond.
3. **E-mails** (facultatif) : choisir le fournisseur, saisir les identifiants SMTP, **Envoyer un test**,
   puis activer. Sans e-mail, les liens d'invitation et de réinitialisation se copient et s'envoient
   sur WhatsApp.
   - Gmail : `smtp.gmail.com`, port 587, STARTTLS, utilisateur = adresse Gmail,
     mot de passe = **mot de passe d'application** (compte Google → Sécurité → validation en deux étapes
     activée → Mots de passe des applications).
4. **Code d'accès du formulaire** : activer et choisir le code communiqué dans les assemblées.
5. **Comptes** : inviter les adjoints, hommes clés, cuisine et comité (lien valable 72 h).
6. **Lien des présents** : activer et définir le mot de passe donné aux personnes chargées de la saisie.
7. Supprimer les éventuels volontaires de test (**Volontaires** → fiche → Supprimer).
8. Diffuser `https://volontaires.sallekambo.org` et le code d'accès.

---

## 4. Espace de démonstration

Même code que la production, lancé avec `DEMO=1` (API) et `VITE_DEMO=1` (front) :

- ~90 volontaires fictifs sur un chantier « en cours » (2 semaines passées, 6 à venir), samedis complets
  avec réserve, présents déjà saisis : toutes les pages ont du contenu.
- Connexion en un clic par rôle sur `/admin/connexion` ; code du formulaire `DEMO` ; mot de passe du lien
  des présents `demo` (rappelés à l'écran, avec un bouton qui les saisit).
- Bandeau jaune sur toutes les pages (Formulaire · Équipe · Présents · Remettre à zéro).
- Remise à zéro **au démarrage** et **chaque nuit vers 3 h** (heure de Douala) ; le responsable ou un
  adjoint peut aussi la déclencher depuis le bandeau avant une présentation.
- **Bloqué** (réponse « Désactivé dans l'espace de démonstration ») : changement de mot de passe,
  mot de passe oublié, configuration et test des e-mails, modification/suppression des comptes,
  code d'accès, mot de passe des présents.
- Aucune base PostgreSQL : SQLite dans `/tmp` du conteneur, effacée à chaque redéploiement.

### 4.1 API de démo (Dokploy)

1. **Create Service → Application**, nom `volontaires-demo`.
2. Même dépôt et branche, **Autodeploy** activé, **Build Type** `Dockerfile`, **Build Path** `/backend`.
3. **Environment** (modèle : `backend/demo.env.example`) :
   ```env
   DEMO=1
   DATABASE_URL=sqlite:////tmp/demo.db
   JWT_SECRET=<nouveau secret, différent de la production>
   CORS_ORIGINS=https://demo.sallekambo.org
   ```
   Pas de `ADMIN_*` : les comptes de démo sont créés automatiquement.
4. **Domains** : `api-demo.sallekambo.org`, port `8000`, HTTPS Let's Encrypt.
5. **Deploy**.

### 4.2 DNS de démo

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `api-demo` | `51.91.157.54` | **DNS uniquement (nuage gris)** |

`demo` est créé automatiquement par Pages à l'étape suivante.

### 4.3 Front de démo (Cloudflare Pages)

Nouveau projet Pages (même procédure qu'en 3.4, attention à l'écran Worker), nom `volontaires-demo` :

| Réglage | Valeur |
|---|---|
| Commande de build | `npm run build` |
| Répertoire de sortie | `dist` |
| Répertoire racine | `frontend` |
| `VITE_API_URL` | `https://api-demo.sallekambo.org` |
| `VITE_DEMO` | `1` |
| `NODE_VERSION` | `22` |
| Domaine personnalisé | `demo.sallekambo.org` |

(modèle : `frontend/demo.env.example`)

### 4.4 Vérification

- `https://api-demo.sallekambo.org/api/health` → `{"status":"ok"}`
- `https://api-demo.sallekambo.org/api/demo/infos` → code `DEMO` et liste des rôles
- `https://demo.sallekambo.org` → bandeau jaune + écran du code avec l'astuce « Le saisir pour moi »
- `https://demo.sallekambo.org/admin/connexion` → boutons Responsable, Adjoint, Homme clé, Cuisine, Comité

Liens à partager :

| Page | Adresse |
|---|---|
| Formulaire volontaire | `https://demo.sallekambo.org` (code `DEMO`) |
| Espace équipe | `https://demo.sallekambo.org/admin/connexion` |
| Saisie des présents | `https://demo.sallekambo.org/presences` (mot de passe `demo`) |

---

## 5. Référence des variables

### API (`backend`, Dokploy → Environment)

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `DATABASE_URL` | oui | `sqlite:///./dev.db` | Base de données. `postgres://` et `postgresql://` sont acceptés. |
| `JWT_SECRET` | oui | — | Signe les sessions et chiffre le mot de passe SMTP. 32 caractères min. sur PostgreSQL. |
| `CORS_ORIGINS` | oui | `http://localhost:5173,https://volontaires.sallekambo.org` | Adresse(s) du front autorisée(s), séparées par des virgules. |
| `ADMIN_EMAIL` | 1er démarrage | — | E-mail du premier compte responsable (créé s'il n'existe aucun compte). |
| `ADMIN_PASSWORD` | 1er démarrage | — | Son mot de passe initial. |
| `ADMIN_NOM` | non | `Responsable volontaires` | Son nom affiché. |
| `FRONT_URL` | non | 1re origine `https://` de `CORS_ORIGINS` | Adresse utilisée dans les liens envoyés (invitations, réinitialisations). |
| `JWT_HOURS` | non | `12` | Durée d'une session équipe, en heures. |
| `INVITATION_HEURES` | non | `72` | Validité d'un lien d'invitation. |
| `REINITIALISATION_MINUTES` | non | `60` | Validité d'un lien de réinitialisation de mot de passe. |
| `RATE_LIMIT_PUBLIC` | non | `20` | Requêtes publiques par minute et par IP. |
| `RATE_LIMIT_LOGIN` | non | `10` | Tentatives de connexion par minute et par IP. |
| `TZ_CHANTIER` | non | `Africa/Douala` | Fuseau pour « aujourd'hui » et la remise à zéro de la démo. |
| `DEMO` | démo | vide | `1` = espace de démonstration. **Jamais en production.** |

### Front (`frontend`, Cloudflare Pages → Variables, lues au build)

| Variable | Production | Démo |
|---|---|---|
| `VITE_API_URL` | `https://api.sallekambo.org` | `https://api-demo.sallekambo.org` |
| `VITE_DEMO` | *(absente)* | `1` |
| `NODE_VERSION` | `22` | `22` |

### Réglages faits dans l'application (pas de variable)

Paramètres du chantier, fournisseur d'e-mail, code d'accès du formulaire, mot de passe du lien des
présents, comptes de l'équipe : tout se règle dans **Réglages** et est stocké en base.

---

## 6. Mettre à jour l'application

```bash
cd ~/App/chantier-volontaires
git add -A && git commit -m "Description du changement" && git push
```

Le push déclenche **quatre** déploiements automatiques : les deux API (Dokploy) et les deux fronts (Pages).

- Les migrations de base s'appliquent seules au redémarrage de l'API de production.
- La démo repart de données neuves à chaque redéploiement.
- Suivre l'avancement : Dokploy → application → **Deployments** ; Cloudflare → projet → **Déploiements**.
- Avant de pousser, lancer les tests : `cd backend && source .venv/bin/activate && pytest`.

Revenir en arrière : Cloudflare Pages → Déploiements → ancien déploiement → **Rollback** ; Dokploy →
Deployments → redéployer un commit précédent (ou `git revert` puis push). ⚠️ Une migration de base déjà
appliquée n'est pas annulée par un retour arrière du code.

## 7. Sauvegardes et restauration

**À configurer avant l'ouverture des inscriptions.**

1. Créer un espace de stockage compatible S3, par exemple **Cloudflare R2** (gratuit jusqu'à 10 Go) :
   Cloudflare → R2 → Créer un bucket `volontaires-backups` → **Gérer les jetons d'API R2** → jeton avec
   droits lecture/écriture sur ce bucket (noter Access Key, Secret Key, endpoint `https://<id>.r2.cloudflarestorage.com`).
2. Dokploy → **Settings → S3 Destinations → Add** : ces identifiants, région `auto`.
3. Dokploy → `volontaires-db` → **Backups → Create Backup** : destination R2, base `volontaires`,
   planification quotidienne (`0 2 * * *`), conservation 14 sauvegardes.
4. **Tester** : lancer une sauvegarde manuelle et vérifier que le fichier apparaît dans le bucket.

Restaurer : Dokploy → `volontaires-db` → Backups → **Restore** (choisir le fichier). Hors Dokploy :

```bash
gunzip -c sauvegarde.sql.gz | psql "postgresql://volontaires:…@hote:5432/volontaires"
```

Export complémentaire, sans serveur : **Volontaires → Export Excel** (CSV) depuis l'application.

## 8. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le front affiche « Pas de connexion au serveur » | `VITE_API_URL` absente ou fausse, ou API arrêtée | Vérifier `…/api/health`, la variable Pages, puis redéployer le front. |
| Erreur CORS dans la console du navigateur | `CORS_ORIGINS` ne contient pas l'adresse exacte du front | Corriger la variable dans Dokploy (sans `/` final), redéployer l'API. |
| L'API ne démarre pas : `JWT_SECRET doit faire au moins 32 caractères` | Secret trop court | Générer un secret (§ 2). |
| Certificat HTTPS invalide sur `api…` | Nuage orange ou DNS pas encore propagé | Mettre le nuage gris, attendre quelques minutes, redéployer dans Dokploy. |
| Boucle de redirection après passage au nuage orange | Mode SSL « Flexible » | Cloudflare → SSL/TLS → **Full (strict)**. |
| Cloudflare propose de déployer un Worker | Mauvais assistant | « Vous cherchez Pages ? » → Importer un référentiel Git. |
| Une variable `VITE_*` modifiée n'a pas d'effet | Lue seulement au build | Réessayer le déploiement dans Pages. |
| Tout le monde est déconnecté, e-mails en échec | `JWT_SECRET` modifié | Remettre l'ancien secret, ou ressaisir le mot de passe SMTP dans Réglages. |
| « Trop de tentatives, réessaie dans une minute » | Limitation anti-abus | Attendre une minute ; ajuster `RATE_LIMIT_*` si besoin. |
| Mot de passe responsable perdu, pas d'e-mail configuré | — | Un autre responsable génère un lien de réinitialisation (Réglages → Comptes). D'où l'intérêt d'avoir **deux comptes responsables**. |
| Démo : « Désactivé dans l'espace de démonstration » | Action volontairement bloquée | Normal (voir § 4). |
| Démo : données modifiées par un visiteur | — | Bandeau → **Remettre à zéro** (responsable ou adjoint). |

## 9. Développement local

```bash
# API
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export ADMIN_EMAIL=toi@exemple.com ADMIN_PASSWORD=motdepasse123
alembic upgrade head            # crée dev.db (SQLite)
uvicorn app.main:app --reload   # http://localhost:8000/docs
pytest                          # tests (SQLite) ; TEST_DATABASE_URL=postgresql://… pytest pour PostgreSQL

# Démo en local (autre base, autre port)
DEMO=1 DATABASE_URL=sqlite:////tmp/demo.db JWT_SECRET=dev CORS_ORIGINS=http://localhost:5173 \
  alembic upgrade head && DEMO=1 DATABASE_URL=sqlite:////tmp/demo.db JWT_SECRET=dev \
  CORS_ORIGINS=http://localhost:5173 uvicorn app.main:app --port 8001

# Front (autre terminal)
cd frontend
npm install
npm run dev                                                       # production locale → API :8000
VITE_DEMO=1 VITE_API_URL=http://localhost:8001 npm run dev        # démo locale → API :8001
```
