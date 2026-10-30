# Configuration Cloudflare

Tout ce qui concerne Cloudflare : domaine, DNS, certificats, sites Pages (production et démo) et stockage
des sauvegardes. Tout tient dans le plan **gratuit**.

> Dans ce guide, remplace `exemple.org` par ton domaine et `<IP_DU_VPS>` par l'adresse IP de ton serveur.

Voir aussi [INSTALLATION.md](INSTALLATION.md) pour l'ordre complet de mise en place.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Compte et domaine](#2-compte-et-domaine)
3. [DNS](#3-dns)
4. [SSL/TLS](#4-ssltls)
5. [Pages : site de production](#5-pages--site-de-production)
6. [Pages : site de démonstration](#6-pages--site-de-démonstration)
7. [En-têtes et routage du front](#7-en-têtes-et-routage-du-front)
8. [R2 : stockage des sauvegardes](#8-r2--stockage-des-sauvegardes)
9. [Limites du plan gratuit](#9-limites-du-plan-gratuit)
10. [Dépannage Cloudflare](#10-dépannage-cloudflare)

---

## 1. Vue d'ensemble

| Service Cloudflare | Utilisation |
|---|---|
| **Registrar** | Achat et renouvellement de `exemple.org` |
| **DNS** | Adresses `volontaires`, `demo`, `api`, `api-demo` |
| **Pages** | Hébergement des deux fronts (production et démo), construits depuis GitHub |
| **R2** (conseillé) | Destination des sauvegardes PostgreSQL faites par Dokploy |

Les API ne passent **pas** par le proxy Cloudflare (nuage gris) : elles sont servies directement par le
VPS `<IP_DU_VPS>`, avec un certificat Let's Encrypt géré par Dokploy.

```
volontaires.exemple.org ─► Cloudflare Pages (volontaires)
demo.exemple.org        ─► Cloudflare Pages (volontaires-demo)
api.exemple.org         ─► <IP_DU_VPS> (Dokploy, API production)
api-demo.exemple.org    ─► <IP_DU_VPS> (Dokploy, API démo)
```

## 2. Compte et domaine

**Sécurité du compte** (Mon profil → Authentification) : activer la **validation en deux étapes**. Le compte
contrôle le domaine, le DNS et les sites : sa perte bloquerait toute l'application.

**Domaine** : Cloudflare → **Gestion de domaine → Domaines enregistrés → `exemple.org`**

| Réglage | Valeur conseillée |
|---|---|
| Renouvellement automatique | **Activé** (le domaine doit vivre au moins jusqu'à la fin du chantier) |
| Moyen de paiement | À jour (carte valide à la date de renouvellement) |
| Contact du titulaire (registrant) | Tes vraies coordonnées et une adresse e-mail que tu consultes |
| Protection WHOIS | Activée (par défaut chez Cloudflare) |
| Verrouillage du transfert | Activé |

> ⚠️ À l'achat, vérifie le contact du titulaire : le navigateur peut préremplir le formulaire avec une
> autre adresse. Pour le corriger : onglet **Contacts** (le changement est validé par e-mail). Si l'e-mail
> du titulaire n'est pas confirmé, le domaine peut être suspendu.

## 3. DNS

Cloudflare → `exemple.org` → **DNS → Enregistrements**

| Type | Nom | Contenu | Proxy | Créé par |
|---|---|---|---|---|
| A | `api` | `<IP_DU_VPS>` | **DNS uniquement (gris)** | à la main |
| A | `api-demo` | `<IP_DU_VPS>` | **DNS uniquement (gris)** | à la main |
| CNAME | `volontaires` | `volontaires.pages.dev` | Proxifié (orange) | automatiquement par Pages |
| CNAME | `demo` | `volontaires-demo.pages.dev` | Proxifié (orange) | automatiquement par Pages |

Ajouter un enregistrement A : **Ajouter un enregistrement** → Type `A` → Nom `api` → Adresse IPv4
`<IP_DU_VPS>` → cliquer sur le nuage pour le passer en **gris** → TTL Auto → Enregistrer.

Règles :

- **Ne pas créer `volontaires` ni `demo` à la main** : ils sont ajoutés quand on attache le domaine
  personnalisé au projet Pages (§ 5 et § 6). Un enregistrement manuel préexistant bloque cette étape :
  le supprimer d'abord.
- **`api` et `api-demo` restent gris** : Let's Encrypt (dans Dokploy) doit joindre le VPS directement
  pour délivrer et renouveler le certificat tous les 90 jours.
- Si le VPS change d'adresse IP : modifier uniquement `api` et `api-demo`.
- Vérifier la propagation : `dig +short api.exemple.org` doit renvoyer `<IP_DU_VPS>`.

Enregistrements de messagerie (MX, SPF, DKIM) : aucun pour l'instant. L'application envoie ses e-mails
via le SMTP d'un fournisseur (Gmail, Brevo…) configuré dans **Réglages** ; si tu utilises plus tard une
adresse `@exemple.org` comme expéditeur, ajouter les enregistrements SPF/DKIM indiqués par ce
fournisseur, sinon les e-mails risquent de finir en spam.

## 4. SSL/TLS

Cloudflare → `exemple.org` → **SSL/TLS**

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Mode de chiffrement | **Complet (strict)** | Indispensable si un jour `api` passe en orange ; sans effet sur les sous-domaines gris. Ne jamais utiliser « Flexible » (boucles de redirection). |
| Certificats Edge → Toujours utiliser HTTPS | **Activé** | Redirige `http://` vers `https://` pour les sites Pages. |
| Version TLS minimale | 1.2 | Compatible avec tous les téléphones récents. |
| HSTS | Désactivé (par défaut) | À n'activer qu'une fois tout stabilisé : difficile à annuler. |

Les certificats de `volontaires` et `demo` sont émis automatiquement par Cloudflare Pages
(quelques minutes après l'ajout du domaine personnalisé).

## 5. Pages : site de production

Cloudflare → **Workers & Pages → Créer**

> ⚠️ L'assistant propose d'abord de créer un **Worker** (« Démarrer avec Hello World », « Importer un
> référentiel » pour Workers). Ne pas le déployer : cliquer sur **« Vous cherchez Pages ? »**, puis
> **Importer un référentiel Git**.

1. Connecter GitHub (une seule fois) et autoriser l'accès au dépôt du projet.
2. Choisir le dépôt → **Commencer la configuration**.
3. Réglages :

   | Réglage | Valeur |
   |---|---|
   | Nom du projet | `volontaires` (donne `volontaires.pages.dev`) |
   | Branche de production | `main` |
   | Préréglage de framework | Aucun (ou Vite) |
   | Commande de build | `npm run build` |
   | Répertoire de sortie du build | `dist` |
   | Répertoire racine (Paramètres avancés) | `frontend` |

4. **Variables d'environnement** (Production) :

   | Nom | Valeur |
   |---|---|
   | `VITE_API_URL` | `https://api.exemple.org` |
   | `NODE_VERSION` | `22` |

5. **Enregistrer et déployer** (1 à 2 minutes).
6. Projet → **Domaines personnalisés → Configurer un domaine** → `volontaires.exemple.org` →
   **Activer le domaine**. Statut attendu : *Actif*.
7. Projet → **Paramètres → Builds → Contrôle des branches** :
   - Branche de production : `main`, déploiements automatiques **activés** ;
   - Déploiements de prévisualisation : **Aucun** (économise le quota de builds).

Modifier une variable : **Paramètres → Variables et secrets** → modifier → puis **Déploiements →**
dernier déploiement → **⋯ → Réessayer le déploiement**. Les variables `VITE_*` sont intégrées au moment
du build : sans nouveau déploiement, l'ancienne valeur reste en ligne.

Revenir à une version précédente : **Déploiements** → choisir un déploiement réussi → **⋯ → Restaurer
(Rollback)**.

## 6. Pages : site de démonstration

Même procédure qu'au § 5 (même dépôt, même branche), avec :

| Réglage | Valeur |
|---|---|
| Nom du projet | `volontaires-demo` |
| Commande / sortie / racine | `npm run build` · `dist` · `frontend` |
| `VITE_API_URL` | `https://api-demo.exemple.org` |
| `VITE_DEMO` | `1` |
| `NODE_VERSION` | `22` |
| Domaine personnalisé | `demo.exemple.org` |
| Déploiements de prévisualisation | Aucun |

`VITE_DEMO=1` affiche le bandeau jaune, les boutons de connexion par rôle et les astuces (code `DEMO`,
mot de passe `demo`). **Ne jamais ajouter `VITE_DEMO` au projet de production.**

Chaque `git push` sur `main` reconstruit les deux projets (2 builds).

## 7. En-têtes et routage du front

Rien à configurer dans le tableau de bord : tout est dans le dépôt.

- `frontend/public/_headers` : en-têtes de sécurité appliqués par Pages (`nosniff`, `no-referrer`, interdiction d'intégrer le site dans une autre page).
- **Routage** : les adresses comme `/moi/…`, `/admin/…` ou `/presences` fonctionnent sans règle de
  redirection : en l'absence de `404.html`, Pages renvoie `index.html` et l'application affiche la bonne
  page. Ne pas ajouter de `404.html` dans `frontend/public`.
- Pas de Worker ni de Page Rules. Une seule règle de redirection est utile si tu ajoutes d'autres adresses
  au projet Pages (voir ci-dessous).

### Une seule adresse pour le site (règle de redirection)

Si d'autres adresses pointent vers le projet Pages (`www.volontaires.exemple.org`, `exemple.org`,
`www.exemple.org`…), **redirige-les toutes vers `volontaires.exemple.org`**. Sinon :

- l'API refuse les appels venant de ces adresses (elles ne sont pas dans `CORS_ORIGINS`) : le site affiche
  « Pas de connexion au serveur » ;
- chaque adresse aurait sa propre mémoire (session de l'équipe, « déjà inscrit sur ce téléphone »).

Ne pas ajouter ces adresses dans `CORS_ORIGINS` : la redirection est la bonne solution.

Cloudflare → ton domaine → **Règles → Règles de redirection → Créer une règle** :

| Réglage | Valeur |
|---|---|
| Nom | `Vers volontaires.exemple.org` |
| Si… | **Expression personnalisée** → **Modifier l'expression** (pas la case « Valeur » du mode simple) :<br>`(http.host in {"www.volontaires.exemple.org" "exemple.org" "www.exemple.org"})` |
| Alors… Type | **Dynamique** |
| Expression | `concat("https://volontaires.exemple.org", http.request.uri.path)` |
| Code de statut | **301** |
| Conserver la chaîne de requête | coché |

L'aperçu de l'expression doit afficher exactement `(http.host in {…})`, sans `eq`. Si Cloudflare avertit que
le trafic n'est peut-être pas proxifié, choisir **Ignorer et déployer quand même** : les enregistrements
créés par Pages sont déjà en orange. Vérifier dans une fenêtre privée que `https://www.volontaires.exemple.org`
bascule sur `volontaires.exemple.org`.

Si l'adresse racine (`exemple.org`) doit servir à autre chose, la retirer de l'expression et du projet Pages.

## 8. R2 : stockage des sauvegardes

Conseillé avant l'ouverture des inscriptions (voir INSTALLATION.md § 7).

1. Cloudflare → **R2 Object Storage** → activer R2 (gratuit jusqu'à 10 Go ; une carte peut être demandée,
   rien n'est facturé sous ce seuil).
2. **Créer un bucket** : nom `volontaires-backups`, emplacement automatique.
3. **Gérer les jetons d'API R2 → Créer un jeton** :
   - Autorisations : **Lecture et écriture d'objets** ;
   - Limiter au bucket `volontaires-backups` ;
   - Noter **Access Key ID**, **Secret Access Key** et le point de terminaison
     `https://<ID-du-compte>.r2.cloudflarestorage.com` (affichés une seule fois).
4. Dans Dokploy → **Settings → S3 Destinations → Add** : ces trois valeurs, bucket
   `volontaires-backups`, région `auto`. **Test** puis enregistrer.
5. Dokploy → base `volontaires-db` → **Backups** : sauvegarde quotidienne vers cette destination.

Le jeton R2 ne donne accès qu'à ce bucket : en cas de fuite, le révoquer et en créer un autre.

## 9. Limites du plan gratuit

| Ressource | Limite | Usage prévu |
|---|---|---|
| Builds Pages | 500 par mois (tous projets) | ~2 par `git push` → largement suffisant |
| Builds simultanés | 1 | Les deux projets se construisent l'un après l'autre |
| Requêtes Pages | Illimitées | — |
| Domaines personnalisés par projet | 100 | 1 |
| R2 | 10 Go, 1 million d'écritures/mois | quelques Mo de sauvegardes |
| Registrar | Prix coûtant, renouvellement annuel | — |

## 10. Dépannage Cloudflare

| Symptôme | Cause | Solution |
|---|---|---|
| Le domaine personnalisé reste « En attente » | Enregistrement `volontaires`/`demo` créé à la main, ou propagation | Supprimer l'enregistrement manuel et réessayer ; attendre 5 à 10 min. |
| « Pas de connexion au serveur » sur une autre adresse du site (`www.…`) | Adresse non autorisée par l'API (CORS) | Rediriger cette adresse vers l'adresse principale (§ 7, règle de redirection). |
| La redirection ne s'applique pas | Expression collée dans la case « Valeur » (aperçu `http.host eq "(http.host in …)"`), ou enregistrement DNS en gris | Rouvrir la règle → **Modifier l'expression** ; vérifier le nuage orange de l'enregistrement. |
| `ERR_TOO_MANY_REDIRECTS` sur l'API | `api` en orange avec SSL « Flexible » | Repasser `api` en gris, ou SSL/TLS → **Complet (strict)**. |
| Certificat invalide sur `api…` | `api` en orange avant l'émission Let's Encrypt, ou DNS pas propagé | Gris, attendre, puis redéployer l'application dans Dokploy. |
| Build Pages en échec : `npm` introuvable ou erreurs de syntaxe | Mauvaise racine ou version de Node | Racine `frontend`, `NODE_VERSION=22`. |
| Build en échec : erreur TypeScript | Code invalide poussé | Lire le journal du build ; corriger puis pousser. Le site reste sur la dernière version réussie. |
| Le site en ligne n'a pas changé après un push | Build en file ou en échec | Projet → **Déploiements** : vérifier le statut du dernier build. |
| Page blanche, console : appels vers `localhost:8000` | `VITE_API_URL` absente au build | Ajouter la variable, **Réessayer le déploiement**. |
| Un Worker « hello world » a été créé par erreur | Assistant Workers | Workers & Pages → le Worker → Paramètres → Supprimer. |
| E-mail « vérifiez votre adresse » / domaine suspendu | Contact du titulaire non validé | Gestion de domaine → Contacts : corriger et valider le lien reçu. |
