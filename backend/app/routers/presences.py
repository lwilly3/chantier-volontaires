"""Présents constatés (facultatif) : saisie par l'équipe ou via le lien dédié /presences,
et analyses (taux de présence, par jour de la semaine, estimations pour les jours à venir)."""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Parametres, Presence, Utilisateur
from ..ratelimit import limit
from ..schemas import ParametresIO, PresenceIn, PresencesAccesIn, PresencesConnexionIn
from ..security import equipe, hash_password, responsable, tous_roles, verify_password
from ..services import aujourd_hui, couverture, get_parametres, journaliser, jours_ouvres

admin = APIRouter(prefix="/api/admin", tags=["présences"])
lien = APIRouter(prefix="/api/presences", tags=["présences (lien dédié)"])
_bearer = HTTPBearer(auto_error=False)

NOMS_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]


# ---------------------------------------------------------------- calculs
def presences_par_jour(db: Session) -> dict[date, Presence]:
    return {pr.jour: pr for pr in db.scalars(select(Presence)).all()}


def analyses(db: Session, p: Parametres) -> dict:
    cov = {date.fromisoformat(c["jour"]): c for c in couverture(db, p, detail=False)}
    saisies = presences_par_jour(db)
    aujourdhui = aujourd_hui()

    jours, cumul_prevus, cumul_presents = [], 0, 0
    par_semaine: dict[int, list] = defaultdict(list)
    for j, pr in sorted(saisies.items()):
        c = cov.get(j)
        if c is None:  # jour retiré du chantier entre-temps
            continue
        prevus = c["presents"]
        taux = round(pr.adultes / prevus, 3) if prevus else None
        jours.append({
            "jour": j.isoformat(), "prevus": prevus, "presents": pr.adultes,
            "mineurs_prevus": c["mineurs"], "mineurs_presents": pr.mineurs,
            "taux": taux, "note": pr.note, "saisi_par": pr.saisi_par,
        })
        if prevus:
            cumul_prevus += prevus
            cumul_presents += pr.adultes
            par_semaine[j.weekday()].append((prevus, pr.adultes))

    taux_global = round(cumul_presents / cumul_prevus, 3) if cumul_prevus else None
    semaine = []
    for wd in range(6):
        lignes = par_semaine.get(wd, [])
        prev, pres = sum(a for a, _ in lignes), sum(b for _, b in lignes)
        semaine.append({
            "jour_semaine": wd, "nom": NOMS_JOURS[wd], "nb_jours": len(lignes),
            "prevus": prev, "presents": pres, "taux": round(pres / prev, 3) if prev else None,
        })

    def taux_pour(j: date) -> float | None:
        s = semaine[j.weekday()]
        return s["taux"] if s["nb_jours"] >= 2 and s["taux"] is not None else taux_global

    prochains = []
    for j, c in sorted(cov.items()):
        if j < aujourdhui or j in saisies:
            continue
        t = taux_pour(j)
        prochains.append({
            "jour": j.isoformat(), "prevus": c["presents"], "mineurs_prevus": c["mineurs"],
            "probables": round(c["presents"] * t) if t is not None else None,
            "repas_probables": round((c["presents"] + c["mineurs"]) * t) if t is not None else None,
        })

    return {
        "nb_jours_saisis": len(jours),
        "taux_global": taux_global,
        "total_prevus": cumul_prevus,
        "total_presents": cumul_presents,
        "par_jour_semaine": semaine,
        "jours": jours,
        "prochains": prochains,
    }


def _jour_valide(p: Parametres, jour: date, jusqu_a_aujourdhui: bool) -> None:
    if jour not in set(jours_ouvres(p)):
        raise HTTPException(422, "Ce jour ne fait pas partie du chantier")
    if jusqu_a_aujourdhui and jour > aujourd_hui():
        raise HTTPException(422, "On ne peut indiquer les présents que pour aujourd'hui ou un jour passé")


def enregistrer(db: Session, jour: date, data: PresenceIn, par: str) -> Presence:
    pr = db.scalar(select(Presence).where(Presence.jour == jour))
    if pr is None:
        pr = Presence(jour=jour)
        db.add(pr)
    pr.adultes, pr.mineurs, pr.note, pr.saisi_par = data.adultes, data.mineurs, data.note.strip(), par
    detail = f"{jour.strftime('%d/%m')} : {data.adultes} adulte(s)" + (
        f", {data.mineurs} mineur(s)" if data.mineurs else ""
    )
    journaliser(db, par, "presences", None, detail)
    db.commit()
    return pr


def _out(pr: Presence) -> dict:
    return {"jour": pr.jour, "adultes": pr.adultes, "mineurs": pr.mineurs, "note": pr.note,
            "saisi_par": pr.saisi_par, "updated_at": pr.updated_at}


# ---------------------------------------------------------------- équipe
@admin.get("/analyses")
def lire_analyses(db: Session = Depends(get_db), _: Utilisateur = Depends(tous_roles)):
    return analyses(db, get_parametres(db))


@admin.put("/presences/{jour}")
def saisir(jour: date, data: PresenceIn, db: Session = Depends(get_db), user: Utilisateur = Depends(equipe)):
    _jour_valide(get_parametres(db), jour, jusqu_a_aujourdhui=True)
    return _out(enregistrer(db, jour, data, user.nom))


@admin.delete("/presences/{jour}", status_code=204)
def effacer(jour: date, db: Session = Depends(get_db), user: Utilisateur = Depends(equipe)):
    pr = db.scalar(select(Presence).where(Presence.jour == jour))
    if pr is not None:
        journaliser(db, user.nom, "presences", None, f"{jour.strftime('%d/%m')} : saisie effacée")
        db.delete(pr)
        db.commit()


@admin.put("/presences-acces", response_model=ParametresIO)
def regler_lien(data: PresencesAccesIn, db: Session = Depends(get_db), user: Utilisateur = Depends(responsable)):
    p = get_parametres(db)
    if data.mot_de_passe:
        p.presences_mdp_hash = hash_password(data.mot_de_passe)
        p.presences_version = (p.presences_version or 0) + 1  # déconnecte l'ancien mot de passe
    if data.actif and not p.presences_mdp_hash:
        raise HTTPException(422, "Choisis un mot de passe pour activer le lien")
    if p.presences_actif and not data.actif:
        p.presences_version = (p.presences_version or 0) + 1
    p.presences_actif = data.actif
    journaliser(db, user.nom, "lien_presences", None, "activé" if p.presences_actif else "désactivé")
    db.commit()
    return p


# ---------------------------------------------------------------- lien dédié /presences
def session_presences(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> str:
    p = get_parametres(db)
    if not p.presences_actif:
        raise HTTPException(403, "La saisie des présences n'est pas activée")
    if creds is None:
        raise HTTPException(401, "Mot de passe requis")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expirée, saisis à nouveau le mot de passe")
    if payload.get("scope") != "presences" or payload.get("v") != p.presences_version:
        raise HTTPException(401, "Le mot de passe a changé, saisis le nouveau")
    return payload["nom"]


@lien.get("/etat")
def etat(db: Session = Depends(get_db)):
    p = get_parametres(db)
    return {"actif": p.presences_actif, "nom_chantier": p.nom_chantier}


@lien.post("/connexion", dependencies=[Depends(limit("presences", 10))])
def connexion(data: PresencesConnexionIn, db: Session = Depends(get_db)):
    p = get_parametres(db)
    if not p.presences_actif:
        raise HTTPException(403, "La saisie des présences n'est pas activée")
    if not verify_password(data.mot_de_passe, p.presences_mdp_hash):
        raise HTTPException(401, "Mot de passe incorrect")
    nom = " ".join(data.nom.split())
    token = jwt.encode(
        {"scope": "presences", "nom": nom, "v": p.presences_version,
         "exp": datetime.now(timezone.utc) + timedelta(hours=14)},
        settings.jwt_secret, algorithm="HS256",
    )
    return {"token": token, "nom": nom}


@lien.get("/jours")
def jours_a_saisir(db: Session = Depends(get_db), nom: str = Depends(session_presences)):
    """Aujourd'hui et les jours passés du chantier (les plus récents d'abord), sans aucun nom."""
    p = get_parametres(db)
    aujourdhui = aujourd_hui()
    saisies = presences_par_jour(db)
    sortie = []
    for c in reversed(couverture(db, p, detail=False)):
        j = date.fromisoformat(c["jour"])
        if j > aujourdhui:
            continue
        pr = saisies.get(j)
        sortie.append({
            "jour": c["jour"], "prevus": c["presents"], "mineurs_prevus": c["mineurs"],
            "saisie": _out(pr) if pr else None,
        })
    return {"nom": nom, "aujourdhui": aujourdhui, "jours": sortie}


@lien.put("/{jour}")
def saisir_par_lien(jour: date, data: PresenceIn, db: Session = Depends(get_db), nom: str = Depends(session_presences)):
    _jour_valide(get_parametres(db), jour, jusqu_a_aujourdhui=True)
    return _out(enregistrer(db, jour, data, f"{nom} (lien présences)"))
