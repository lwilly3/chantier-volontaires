from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Utilisateur

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: Utilisateur) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "v": user.version_session,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Utilisateur:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée, reconnecte-toi")
    if payload.get("scope") or "sub" not in payload:  # ex. jeton du lien de saisie des présences
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise")
    user = db.get(Utilisateur, int(payload["sub"]))
    if user is None or not user.actif or not user.password_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte inactif")
    if payload.get("v", 0) != user.version_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Mot de passe modifié, reconnecte-toi")
    return user


def definir_mot_de_passe(user: Utilisateur, password: str) -> None:
    """Change le mot de passe et déconnecte toutes les sessions existantes de ce compte."""
    user.password_hash = hash_password(password)
    user.version_session = (user.version_session or 0) + 1


def utilisateur_optionnel(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Utilisateur | None:
    """Membre de l'équipe connecté, ou None (sans erreur) pour les visiteurs."""
    if creds is None:
        return None
    try:
        return current_user(creds, db)
    except HTTPException:
        return None


def require_roles(*roles: str):
    def checker(user: Utilisateur = Depends(current_user)) -> Utilisateur:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé pour ton rôle")
        return user

    return checker


# Raccourcis
tous_roles = require_roles("responsable", "adjoint", "relais", "cuisine", "comite")
equipe = require_roles("responsable", "adjoint")
# Gestion courante des volontaires : équipe + hommes clés (sans export, journal, suppression ni réglages)
gestion = require_roles("responsable", "adjoint", "relais")
responsable = require_roles("responsable")
