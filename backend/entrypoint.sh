#!/bin/sh
set -e
echo "→ Migrations de la base de données"
alembic upgrade head
echo "→ Démarrage de l'API"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
