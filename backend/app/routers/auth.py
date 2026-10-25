from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Utilisateur
from ..ratelimit import limit
from ..schemas import LoginIn, MotDePasseIn, UtilisateurOut
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", dependencies=[Depends(limit("login", settings.rate_limit_login))])
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(Utilisateur).where(func.lower(Utilisateur.email) == data.email.lower()))
    if user is None or not user.actif or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "E-mail ou mot de passe incorrect")
    return {"token": create_token(user), "utilisateur": UtilisateurOut.model_validate(user)}


@router.get("/me", response_model=UtilisateurOut)
def me(user: Utilisateur = Depends(current_user)):
    return user


@router.post("/mot-de-passe", status_code=204)
def changer_mot_de_passe(
    data: MotDePasseIn, user: Utilisateur = Depends(current_user), db: Session = Depends(get_db)
):
    if not verify_password(data.ancien, user.password_hash):
        raise HTTPException(400, "Ancien mot de passe incorrect")
    user.password_hash = hash_password(data.nouveau)
    db.commit()
