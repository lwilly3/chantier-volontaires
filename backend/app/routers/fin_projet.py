"""Fin du projet : effacement ou anonymisation des données personnelles (protection des données).

Action irréversible réservée au responsable, confirmée par son mot de passe et le mot « EFFACER ».
"""
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ConfigEmail, Disponibilite, Jeton, Journal, Presence, Utilisateur, Volontaire
from ..security import responsable, verify_password
from ..services import get_parametres, journaliser

router = APIRouter(prefix="/api/admin/fin-de-projet", tags=["fin de projet"])

MOT_DE_CONFIRMATION = "EFFACER"


class FinProjetIn(BaseModel):
    mode: Literal["anonymiser", "effacer"]
    supprimer_comptes: bool = True  # comptes de l'équipe sauf celui du responsable qui agit
    fermer_inscriptions: bool = True
    effacer_config_email: bool = True
    mot_de_passe: str
    confirmation: str


@router.get("/apercu")
def apercu(db: Session = Depends(get_db), moi: Utilisateur = Depends(responsable)):
    """Ce qui sera concerné, pour l'afficher avant confirmation."""
    return {
        "volontaires": db.scalar(select(func.count()).select_from(Volontaire)),
        "disponibilites": db.scalar(select(func.count()).select_from(Disponibilite)),
        "presences": db.scalar(select(func.count()).select_from(Presence)),
        "journal": db.scalar(select(func.count()).select_from(Journal)),
        "comptes_equipe": db.scalar(select(func.count()).select_from(Utilisateur).where(Utilisateur.id != moi.id)),
        "email_configure": bool(db.scalar(select(ConfigEmail.hote).where(ConfigEmail.id == 1))),
    }


@router.post("")
def fin_de_projet(data: FinProjetIn, db: Session = Depends(get_db), moi: Utilisateur = Depends(responsable)):
    if data.confirmation.strip().upper() != MOT_DE_CONFIRMATION:
        raise HTTPException(422, f"Tape {MOT_DE_CONFIRMATION} pour confirmer")
    if not verify_password(data.mot_de_passe, moi.password_hash):
        raise HTTPException(403, "Mot de passe incorrect")

    nb_vol = db.scalar(select(func.count()).select_from(Volontaire))
    resume: dict[str, int | str] = {"mode": data.mode, "volontaires": nb_vol}

    if data.mode == "effacer":
        db.execute(delete(Disponibilite))
        db.execute(delete(Presence))
        db.execute(delete(Volontaire))
    else:
        # Anonymiser : plus aucun nom, numéro, remarque ni lien utilisable ; les chiffres restent
        for v in db.scalars(select(Volontaire)):
            v.nom = f"Volontaire n°{v.id}"
            v.telephone = f"anonyme-{v.id}"
            v.remarques = ""
            v.token = secrets.token_urlsafe(24)  # l'ancien lien personnel ne fonctionne plus
            v.recrute_par_id = None
            v.actif = True  # garde le volontaire dans les statistiques
        db.execute(update(Presence).values(saisi_par="", note=""))

    # Le journal contient des noms, des numéros et des extraits de messages
    db.execute(delete(Journal))
    db.execute(delete(Jeton))

    if data.supprimer_comptes:
        db.execute(update(Volontaire).values(recrute_par_id=None))
        autres = db.scalars(select(Utilisateur).where(Utilisateur.id != moi.id)).all()
        resume["comptes_supprimes"] = len(autres)
        for u in autres:
            db.delete(u)

    if data.effacer_config_email:
        db.execute(delete(ConfigEmail))

    p = get_parametres(db)
    if data.fermer_inscriptions:
        p.inscriptions_ouvertes = False
        p.presences_actif = False
        p.presences_mdp_hash = ""
        p.presences_version = (p.presences_version or 0) + 1

    journaliser(
        db,
        moi.nom,
        "fin_de_projet",
        None,
        ("Données anonymisées" if data.mode == "anonymiser" else "Données effacées")
        + f" : {nb_vol} volontaire(s)"
        + (f", {resume.get('comptes_supprimes', 0)} compte(s) supprimé(s)" if data.supprimer_comptes else ""),
    )
    db.commit()
    return resume
