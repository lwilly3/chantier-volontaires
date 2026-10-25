"""Liens à usage unique : invitations et réinitialisations de mot de passe."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import settings
from .models import Jeton, Utilisateur, now_utc

CHEMIN = {"invitation": "invitation", "reinitialisation": "reinitialiser"}


def empreinte(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def lien(type_: str, token: str) -> str:
    return f"{settings.front_url}/admin/{CHEMIN[type_]}/{token}"


def creer(db: Session, user: Utilisateur, type_: str, cree_par: str) -> tuple[str, Jeton]:
    """Crée un lien et annule les liens encore valides du même type pour ce compte."""
    maintenant = now_utc()
    db.execute(
        update(Jeton)
        .where(Jeton.utilisateur_id == user.id, Jeton.type == type_, Jeton.utilise_at.is_(None))
        .values(utilise_at=maintenant)
    )
    duree = (
        timedelta(hours=settings.invitation_heures)
        if type_ == "invitation"
        else timedelta(minutes=settings.reinitialisation_minutes)
    )
    token = secrets.token_urlsafe(32)
    j = Jeton(
        utilisateur_id=user.id, type=type_, empreinte=empreinte(token),
        expire_at=maintenant + duree, cree_par=cree_par,
    )
    db.add(j)
    db.flush()
    return token, j


def invalider_tous(db: Session, user_id: int) -> None:
    db.execute(
        update(Jeton).where(Jeton.utilisateur_id == user_id, Jeton.utilise_at.is_(None)).values(utilise_at=now_utc())
    )


def _aware(d: datetime) -> datetime:
    # SQLite renvoie des dates sans fuseau
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def trouver_valide(db: Session, token: str) -> Jeton | None:
    j = db.scalar(select(Jeton).where(Jeton.empreinte == empreinte(token)))
    if j is None or j.utilise_at is not None or _aware(j.expire_at) < now_utc():
        return None
    return j


def invitation_en_cours(db: Session, user_id: int) -> Jeton | None:
    j = db.scalar(
        select(Jeton)
        .where(Jeton.utilisateur_id == user_id, Jeton.type == "invitation", Jeton.utilise_at.is_(None))
        .order_by(Jeton.created_at.desc())
    )
    return j


def est_expire(j: Jeton) -> bool:
    return _aware(j.expire_at) < now_utc()
