"""Routes de l'espace équipe (responsable, adjoints, cuisine, comité)."""
import csv
import io
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Disponibilite, Journal, Utilisateur, Volontaire
from ..schemas import (
    ParametresIO,
    UtilisateurIn,
    UtilisateurOut,
    VolontaireAdminOut,
    VolontaireIn,
    VolontaireUpdate,
)
from ..security import equipe, hash_password, responsable, tous_roles
from ..services import (
    charger_volontaire,
    couverture,
    get_parametres,
    journaliser,
    normaliser_telephone,
    nouveau_token,
    synchroniser_disponibilites,
    valider_profil,
    volontaires_du_jour,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

CRENEAU_LIBELLE = {"journee": "Journée", "matin": "Matin", "apres_midi": "Après-midi"}


# ---------------------------------------------------------------- tableau de bord
@router.get("/couverture")
def get_couverture(db: Session = Depends(get_db), _: Utilisateur = Depends(tous_roles)):
    p = get_parametres(db)
    jours = couverture(db, p)
    actifs = db.scalar(select(func.count()).select_from(Volontaire).where(Volontaire.actif.is_(True)))
    sans_dispo = db.scalar(
        select(func.count())
        .select_from(Volontaire)
        .where(Volontaire.actif.is_(True), ~Volontaire.disponibilites.any())
    )
    par_assemblee = dict(
        db.execute(
            select(Volontaire.assemblee, func.count())
            .where(Volontaire.actif.is_(True))
            .group_by(Volontaire.assemblee)
        ).all()
    )
    totaux = [j["total"] for j in jours]
    return {
        "plafond_jour": p.plafond_jour,
        "seuil_alerte": p.seuil_alerte,
        "jours": jours,
        "resume": {
            "volontaires": actifs,
            "sans_disponibilite": sans_dispo,
            "par_assemblee": par_assemblee,
            "jours_chantier": len(jours),
            "jours_vides": sum(1 for t in totaux if t == 0),
            "jours_complets": sum(1 for t in totaux if t >= p.plafond_jour),
            "moyenne_jour": round(sum(totaux) / len(totaux), 1) if totaux else 0,
            "personnes_jours": sum(min(t, p.plafond_jour) for t in totaux),
        },
    }


@router.get("/jours/{jour}")
def get_jour(jour: date, db: Session = Depends(get_db), _: Utilisateur = Depends(equipe)):
    p = get_parametres(db)
    return {"jour": jour, "plafond_jour": p.plafond_jour, "volontaires": volontaires_du_jour(db, p, jour)}


# ---------------------------------------------------------------- volontaires
@router.get("/volontaires", response_model=list[VolontaireAdminOut])
def lister(
    q: str | None = None,
    assemblee: str | None = None,
    competence: str | None = None,
    jour: date | None = None,
    statut: Literal["actifs", "inactifs", "tous"] = "actifs",
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(equipe),
):
    stmt = select(Volontaire).options(selectinload(Volontaire.disponibilites)).order_by(Volontaire.nom)
    if statut != "tous":
        stmt = stmt.where(Volontaire.actif.is_(statut == "actifs"))
    if q:
        motif = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(func.lower(Volontaire.nom).like(motif), Volontaire.telephone.like(f"%{q.strip()}%"))
        )
    if assemblee:
        stmt = stmt.where(Volontaire.assemblee == assemblee)
    if jour:
        stmt = stmt.where(Volontaire.disponibilites.any(Disponibilite.jour == jour))
    resultats = db.scalars(stmt).all()
    if competence:  # filtrage en Python : JSON portable SQLite / PostgreSQL
        resultats = [v for v in resultats if competence in (v.competences or [])]
    return resultats


@router.post("/volontaires", response_model=VolontaireAdminOut, status_code=201)
def creer(data: VolontaireIn, db: Session = Depends(get_db), user: Utilisateur = Depends(equipe)):
    p = get_parametres(db)
    tel = normaliser_telephone(data.telephone)
    if db.scalar(select(Volontaire.id).where(Volontaire.telephone == tel)):
        raise HTTPException(409, "Ce numéro est déjà inscrit")
    v = Volontaire(
        nom=data.nom,
        telephone=tel,
        assemblee=data.assemblee,
        competences=valider_profil(p, data.assemblee, data.competences),
        est_mineur=data.est_mineur,
        remarques=data.remarques.strip(),
        token=nouveau_token(),
        source="adjoint",
        disponibilites=[],
    )
    db.add(v)
    synchroniser_disponibilites(db, p, v, [d.model_dump() for d in data.disponibilites])
    db.flush()
    journaliser(db, user.nom, "inscription", v.id, f"Saisi par l'équipe — {len(v.disponibilites)} jour(s)")
    db.commit()
    return v


def _get(db: Session, vid: int) -> Volontaire:
    v = charger_volontaire(db, id=vid)
    if v is None:
        raise HTTPException(404, "Volontaire introuvable")
    return v


@router.get("/volontaires/{vid}", response_model=VolontaireAdminOut)
def detail(vid: int, db: Session = Depends(get_db), _: Utilisateur = Depends(equipe)):
    return _get(db, vid)


@router.put("/volontaires/{vid}", response_model=VolontaireAdminOut)
def modifier(
    vid: int, data: VolontaireUpdate, db: Session = Depends(get_db), user: Utilisateur = Depends(equipe)
):
    p = get_parametres(db)
    v = _get(db, vid)
    tel = normaliser_telephone(data.telephone)
    if tel != v.telephone and db.scalar(select(Volontaire.id).where(Volontaire.telephone == tel)):
        raise HTTPException(409, "Ce numéro est déjà utilisé par un autre volontaire")
    v.nom, v.telephone, v.assemblee = data.nom, tel, data.assemblee
    v.competences = valider_profil(p, data.assemblee, data.competences)
    v.est_mineur, v.remarques = data.est_mineur, data.remarques.strip()
    if data.actif is not None and data.actif != v.actif:
        v.actif = data.actif
        journaliser(db, user.nom, "reactivation" if data.actif else "desactivation", v.id)
    r = synchroniser_disponibilites(db, p, v, [d.model_dump() for d in data.disponibilites])
    journaliser(db, user.nom, "modification", v.id, f"+{r['ajoutes']} / -{r['retires']} / ~{r['modifies']} jour(s)")
    db.commit()
    return v


@router.delete("/volontaires/{vid}", status_code=204)
def supprimer(vid: int, db: Session = Depends(get_db), user: Utilisateur = Depends(responsable)):
    v = _get(db, vid)
    journaliser(db, user.nom, "suppression", None, f"{v.nom} ({v.telephone})")
    db.delete(v)
    db.commit()


@router.post("/volontaires/{vid}/nouveau-lien", response_model=VolontaireAdminOut)
def regenerer_lien(vid: int, db: Session = Depends(get_db), user: Utilisateur = Depends(equipe)):
    v = _get(db, vid)
    v.token = nouveau_token()
    journaliser(db, user.nom, "nouveau_lien", v.id, "L'ancien lien personnel ne fonctionne plus")
    db.commit()
    return v


@router.get("/export/volontaires.csv")
def export_csv(db: Session = Depends(get_db), _: Utilisateur = Depends(equipe)):
    p = get_parametres(db)
    vols = db.scalars(
        select(Volontaire).options(selectinload(Volontaire.disponibilites)).order_by(Volontaire.nom)
    ).all()
    buf = io.StringIO()
    buf.write("﻿")  # BOM : Excel ouvre correctement les accents
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Nom", "Téléphone", "Assemblée", "Compétences", "Mineur", "Actif", "Nb jours", "Jours", "Remarques"])
    for v in vols:
        jours = ", ".join(
            f"{d.jour.strftime('%d/%m')}" + ("" if d.creneau == "journee" else f" ({CRENEAU_LIBELLE[d.creneau]})")
            for d in v.disponibilites
        )
        w.writerow([
            v.nom, v.telephone, v.assemblee, ", ".join(v.competences or []),
            "Oui" if v.est_mineur else "Non", "Oui" if v.actif else "Non",
            len(v.disponibilites), jours, v.remarques,
        ])
    buf.seek(0)
    nom = f"volontaires-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nom}"'},
    )


@router.get("/journal")
def journal(
    limite: int = Query(100, le=500),
    volontaire_id: int | None = None,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(equipe),
):
    stmt = select(Journal, Volontaire.nom).outerjoin(Volontaire).order_by(Journal.created_at.desc()).limit(limite)
    if volontaire_id:
        stmt = stmt.where(Journal.volontaire_id == volontaire_id)
    return [
        {
            "id": j.id, "date": j.created_at, "acteur": j.acteur, "action": j.action,
            "volontaire_id": j.volontaire_id, "volontaire": nom, "details": j.details,
        }
        for j, nom in db.execute(stmt).all()
    ]


# ---------------------------------------------------------------- paramètres
@router.get("/parametres", response_model=ParametresIO)
def lire_parametres(db: Session = Depends(get_db), _: Utilisateur = Depends(tous_roles)):
    return get_parametres(db)


@router.put("/parametres", response_model=ParametresIO)
def ecrire_parametres(data: ParametresIO, db: Session = Depends(get_db), user: Utilisateur = Depends(responsable)):
    if data.date_fin < data.date_debut:
        raise HTTPException(422, "La date de fin doit être après la date de début")
    if data.seuil_alerte > data.plafond_jour:
        raise HTTPException(422, "Le seuil d'alerte doit être inférieur ou égal au plafond")
    p = get_parametres(db)
    for champ, valeur in data.model_dump().items():
        setattr(p, champ, valeur)
    journaliser(db, user.nom, "parametres", None, f"Plafond {p.plafond_jour}, du {p.date_debut} au {p.date_fin}")
    db.commit()
    return p


# ---------------------------------------------------------------- utilisateurs
@router.get("/utilisateurs", response_model=list[UtilisateurOut])
def lister_utilisateurs(db: Session = Depends(get_db), _: Utilisateur = Depends(responsable)):
    return db.scalars(select(Utilisateur).order_by(Utilisateur.nom)).all()


@router.post("/utilisateurs", response_model=UtilisateurOut, status_code=201)
def creer_utilisateur(data: UtilisateurIn, db: Session = Depends(get_db), _: Utilisateur = Depends(responsable)):
    if not data.password:
        raise HTTPException(422, "Mot de passe requis (8 caractères minimum)")
    if db.scalar(select(Utilisateur.id).where(func.lower(Utilisateur.email) == data.email.lower())):
        raise HTTPException(409, "Un compte existe déjà avec cet e-mail")
    u = Utilisateur(
        nom=data.nom, email=data.email.lower(), role=data.role,
        password_hash=hash_password(data.password), actif=data.actif,
    )
    db.add(u)
    db.commit()
    return u


@router.put("/utilisateurs/{uid}", response_model=UtilisateurOut)
def modifier_utilisateur(
    uid: int, data: UtilisateurIn, db: Session = Depends(get_db), moi: Utilisateur = Depends(responsable)
):
    u = db.get(Utilisateur, uid)
    if u is None:
        raise HTTPException(404, "Compte introuvable")
    if u.id == moi.id and (data.role != "responsable" or not data.actif):
        raise HTTPException(400, "Vous ne pouvez pas retirer vos propres droits de responsable")
    autre = db.scalar(
        select(Utilisateur.id).where(func.lower(Utilisateur.email) == data.email.lower(), Utilisateur.id != uid)
    )
    if autre:
        raise HTTPException(409, "Un compte existe déjà avec cet e-mail")
    u.nom, u.email, u.role, u.actif = data.nom, data.email.lower(), data.role, data.actif
    if data.password:
        u.password_hash = hash_password(data.password)
    db.commit()
    return u
