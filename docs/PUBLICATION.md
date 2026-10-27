# Rendre le dépôt public (fin du chantier)

Liste à suivre avant de passer le dépôt GitHub en **public**, pour que d'autres chantiers puissent réutiliser
« Volontaires » sans exposer d'information personnelle ni de secret.

## 1. Effacer les données réelles

- [ ] Réglages → **Fin du projet** : anonymiser ou tout effacer.
- [ ] Supprimer les anciennes sauvegardes dans le bucket R2.
- [ ] Vérifier qu'aucun export CSV, capture d'écran ou fichier de données n'est dans le dépôt
      (`git log --all --stat | grep -i -E "csv|xlsx|png|jpg"`).

## 2. Vérifier les secrets

Aucun secret ne doit être dans le code ni dans l'historique Git :

```bash
git log -p --all | grep -n -i -E "JWT_SECRET=|ADMIN_PASSWORD=|password=|smtp" | grep -v -E "example|exemple|remplacez|choisissez|genere"
```

- [ ] Les vrais secrets sont uniquement dans Dokploy et Cloudflare (variables d'environnement), jamais dans un fichier.
- [ ] Par précaution, **changer** après publication : `JWT_SECRET` de la démo, mot de passe du compte responsable,
      mot de passe SMTP s'il est encore utilisé.

## 3. Informations propres à ton installation

Ces éléments décrivent *ton* installation ; ils peuvent rester comme exemple ou être remplacés par des valeurs
génériques (`exemple.org`) :

- domaines `sallekambo.org`, adresse IP du VPS et e-mail de l'administrateur dans `docs/INSTALLATION.md`,
  `docs/CLOUDFLARE.md`, `backend/.env.example`, `frontend/.env.example` ;
- historique Git : les messages de commit sont publics.

Si tu préfères un historique propre : créer un nouveau dépôt public à partir de l'état final (un seul commit
« Version 1.0 »), et garder l'ancien dépôt privé ou l'archiver.

## 4. Publier

1. GitHub → dépôt → **Settings → General → Danger Zone → Change visibility → Public**.
2. Description : « Volontaires — gestion des volontaires de chantier (inscriptions, disponibilités, couverture,
   rappels WhatsApp). Logiciel libre, MIT. »
3. Sujets (topics) : `volunteers`, `fastapi`, `react`, `self-hosted`, `french`.
4. Vérifier que `LICENSE`, `NOTICE.md` et `README.md` s'affichent correctement.
5. Facultatif : créer une version (Releases → « v1.0 ») pour marquer l'état utilisé pendant le chantier.

## Pourquoi la licence MIT

- **Simple et très permissive** : n'importe quelle équipe peut installer, modifier et réutiliser le code
  librement, sans démarche, à condition de garder la mention de copyright et la licence.
- Adaptée à des bénévoles qui veulent juste « reprendre l'outil » pour leur chantier.

Alternative si tu veux que **toutes les améliorations restent libres** (y compris celles d'une version hébergée
en ligne) : la licence **AGPL-3.0**. Elle oblige quiconque modifie et met en ligne l'application à publier ses
modifications, mais elle est plus contraignante pour les réutilisateurs. Changer de licence avant la
publication suffit : remplacer le fichier `LICENSE` et la mention dans le README.
