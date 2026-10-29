"""Messages WhatsApp aux volontaires : liste des destinataires pour l'envoi assisté.

L'application ne peut pas envoyer elle-même des messages WhatsApp : elle fournit la liste
(nom, numéro, jour, créneau, lien personnel) et le front ouvre WhatsApp, message prérempli,
pour chaque personne ou pour un groupe / la communauté.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Utilisateur, Volontaire
from ..security import gestion
from ..services import etat_jours_volontaires, get_parametres, journaliser, jours_ouvres, volontaires_du_jour

router = APIRouter(prefix="/api/admin/messages", tags=["messages"])

Cible = Literal["tous", "jour", "assemblee", "recrues", "hors_dates"]
Reserve = Literal["attendus", "reserve", "tous"]


def _destinataire(v: Volontaire, **extra) -> dict:
    return {
        "id": v.id,
        "nom": v.nom,
        "telephone": v.telephone,
        "token": v.token,
        "assemblee": v.assemblee,
        "jour": None,
        "creneau": None,
        "en_reserve": False,
        **extra,
    }


@router.get("/destinataires")
def destinataires(
    cible: Cible,
    jour: date | None = None,
    reserve: Reserve = "attendus",
    assemblee: str | None = None,
    db: Session = Depends(get_db),
    moi: Utilisateur = Depends(gestion),
):
    """Volontaires actifs visés par un message.

    - tous : tous les volontaires actifs ;
    - jour : ceux inscrits ce jour-là (attendus, réserve ou tous) ;
    - assemblee : ceux d'une assemblée ;
    - recrues : ceux recrutés par la personne connectée ;
    - hors_dates : ceux dont des jours sont hors des dates du chantier, ou qui n'ont plus aucun jour.
    Un homme clé ne peut viser que ses propres recrues."""
    if moi.role == "relais" and cible != "recrues":
        raise HTTPException(403, "Un homme clé peut écrire uniquement à ses recrues")
    p = get_parametres(db)

    if cible == "jour":
        if jour is None:
            raise HTTPException(422, "Choisis un jour")
        if jour not in set(jours_ouvres(p)):
            raise HTTPException(422, "Ce jour n'est pas un jour de chantier")
        lignes = volontaires_du_jour(db, p, jour)
        if reserve == "attendus":
            lignes = [l for l in lignes if not l["en_reserve"]]
        elif reserve == "reserve":
            lignes = [l for l in lignes if l["en_reserve"]]
        ids = [l["volontaire_id"] for l in lignes]
        vols = {v.id: v for v in db.scalars(select(Volontaire).where(Volontaire.id.in_(ids)))} if ids else {}
        return [
            _destinataire(vols[l["volontaire_id"]], jour=jour.isoformat(), creneau=l["creneau"], en_reserve=l["en_reserve"])
            for l in lignes
        ]

    q = select(Volontaire).where(Volontaire.actif.is_(True)).options(selectinload(Volontaire.disponibilites))
    if cible == "hors_dates":
        # jours hors des dates du chantier, ou plus aucun jour dans ces dates : à prévenir
        etat = etat_jours_volontaires(db, set(jours_ouvres(p)))
        ids = etat["hors_dates"] | etat["sans_jour"]
        if not ids:
            return []
        q = q.where(Volontaire.id.in_(ids))
    elif cible == "assemblee":
        if not assemblee:
            raise HTTPException(422, "Choisis une assemblée")
        q = q.where(Volontaire.assemblee == assemblee)
    elif cible == "recrues":
        q = q.where(Volontaire.recrute_par_id == moi.id)
    return [_destinataire(v) for v in db.scalars(q.order_by(Volontaire.nom))]


class EnvoiIn(BaseModel):
    cible: str = Field(max_length=200)  # libellé lisible, ex. « Samedi 7 nov. (attendus) »
    mode: Literal["individuel", "groupe"]
    nombre: int = Field(ge=0, le=10000)
    apercu: str = Field(default="", max_length=300)


@router.post("/journal", status_code=204)
def tracer_envoi(data: EnvoiIn, db: Session = Depends(get_db), moi: Utilisateur = Depends(gestion)):
    """Garde une trace dans le journal : qui a préparé quel message, pour qui."""
    if data.mode == "groupe":
        details = f"Publication groupe/communauté — {data.cible} : « {data.apercu} »"
    else:
        details = f"Envoi un par un à {data.nombre} volontaire(s) — {data.cible} : « {data.apercu} »"
    journaliser(db, moi.nom, "message", None, details[:1000])
    db.commit()
