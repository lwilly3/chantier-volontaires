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
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée, reconnectez-vous")
    user = db.get(Utilisateur, int(payload["sub"]))
    if user is None or not user.actif:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte inactif")
    return user


def require_roles(*roles: str):
    def checker(user: Utilisateur = Depends(current_user)) -> Utilisateur:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès non autorisé pour votre rôle")
        return user

    return checker


# Raccourcis
tous_roles = require_roles("responsable", "adjoint", "cuisine", "comite")
equipe = require_roles("responsable", "adjoint")
responsable = require_roles("responsable")
