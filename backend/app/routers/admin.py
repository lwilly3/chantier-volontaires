"""Routes de l'espace équipe (responsable, adjoints, cuisine, comité)."""
import csv
import io
import secrets
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .. import jetons, mailer
from ..config import settings
from ..db import get_db
from ..models import Disponibilite, Journal, Utilisateur, Volontaire, now_utc
from ..schemas import (
    ConfigEmailIn,
    ConfigEmailOut,
    InvitationIn,
    LienOut,
    ParametresIO,
    TestEmailIn,
    UtilisateurIn,
    UtilisateurOut,
    VolontaireAdminOut,
    VolontaireIn,
    VolontaireUpdate,
)
from ..security import definir_mot_de_passe, equipe, gestion, hash_password, responsable, tous_roles
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
def get_jour(jour: date, db: Session = Depends(get_db), _: Utilisateur = Depends(gestion)):
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
    recrute_par: str | None = None,  # "moi" ou identifiant d'un membre de l'équipe
    db: Session = Depends(get_db),
    moi: Utilisateur = Depends(gestion),
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
    if recrute_par:
        rid = moi.id if recrute_par == "moi" else int(recrute_par) if recrute_par.isdigit() else -1
        stmt = stmt.where(Volontaire.recrute_par_id == rid)
    resultats = db.scalars(stmt).all()
    if competence:  # filtrage en Python : JSON portable SQLite / PostgreSQL
        resultats = [v for v in resultats if competence in (v.competences or [])]
    return resultats


@router.post("/volontaires", response_model=VolontaireAdminOut, status_code=201)
def creer(data: VolontaireIn, db: Session = Depends(get_db), user: Utilisateur = Depends(gestion)):
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
        recrute_par_id=user.id if user.role == "relais" else None,
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
def detail(vid: int, db: Session = Depends(get_db), _: Utilisateur = Depends(gestion)):
    return _get(db, vid)


@router.put("/volontaires/{vid}", response_model=VolontaireAdminOut)
def modifier(
    vid: int, data: VolontaireUpdate, db: Session = Depends(get_db), user: Utilisateur = Depends(gestion)
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
def regenerer_lien(vid: int, db: Session = Depends(get_db), user: Utilisateur = Depends(gestion)):
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
ROLE_LIBELLE = {"responsable": "Responsable", "adjoint": "Adjoint", "relais": "Homme clé", "cuisine": "Cuisine", "comite": "Comité"}


def _out(db: Session, u: Utilisateur) -> UtilisateurOut:
    o = UtilisateurOut.model_validate(u)
    if u.statut == "invite":
        j = jetons.invitation_en_cours(db, u.id)
        if j is not None:
            o.invitation_expire_at = j.expire_at
            o.invitation_expiree = jetons.est_expire(j)
        else:
            o.invitation_expiree = True
    return o


def _email_libre(db: Session, email: str | None, sauf_id: int | None = None) -> None:
    if not email:
        return
    stmt = select(Utilisateur.id).where(func.lower(Utilisateur.email) == email.lower())
    if sauf_id:
        stmt = stmt.where(Utilisateur.id != sauf_id)
    if db.scalar(stmt):
        raise HTTPException(409, "Un compte existe déjà avec cet e-mail")


def _get_user(db: Session, uid: int) -> Utilisateur:
    u = db.get(Utilisateur, uid)
    if u is None:
        raise HTTPException(404, "Compte introuvable")
    return u


def _lien_et_email(db: Session, u: Utilisateur, type_: str, par: Utilisateur, envoyer_email: bool) -> LienOut:
    token, j = jetons.creer(db, u, type_, par.nom)
    url = jetons.lien(type_, token)
    journaliser(db, par.nom, f"lien_{type_}", None, f"{u.nom}")
    db.commit()
    envoye, erreur = False, None
    if envoyer_email and u.email:
        if not mailer.email_disponible(db):
            erreur = "L'envoi d'e-mails n'est pas activé (Réglages → E-mails) : transmettez le lien par WhatsApp."
        else:
            if type_ == "invitation":
                sujet, texte, html = mailer.email_invitation(
                    u.nom, ROLE_LIBELLE[u.role], url, settings.invitation_heures, par.nom
                )
            else:
                sujet, texte, html = mailer.email_reinitialisation(u.nom, url, settings.reinitialisation_minutes)
            try:
                mailer.envoyer(mailer.get_config(db), u.email, sujet, texte, html)
                envoye = True
            except mailer.EmailErreur as e:
                erreur = str(e)
    return LienOut(utilisateur=_out(db, u), lien=url, expire_at=j.expire_at, email_envoye=envoye, erreur_email=erreur)


@router.get("/utilisateurs", response_model=list[UtilisateurOut])
def lister_utilisateurs(db: Session = Depends(get_db), _: Utilisateur = Depends(responsable)):
    recrues = dict(
        db.execute(
            select(Volontaire.recrute_par_id, func.count())
            .where(Volontaire.recrute_par_id.is_not(None), Volontaire.actif.is_(True))
            .group_by(Volontaire.recrute_par_id)
        ).all()
    )
    sortie = []
    for u in db.scalars(select(Utilisateur).order_by(Utilisateur.nom)).all():
        o = _out(db, u)
        o.nb_recrues = recrues.get(u.id, 0)
        sortie.append(o)
    return sortie


@router.get("/mon-recrutement")
def mon_lien_recrutement(db: Session = Depends(get_db), moi: Utilisateur = Depends(gestion)):
    """Lien d'inscription personnel : les volontaires inscrits par ce lien sont rattachés à moi."""
    if not moi.code_recrutement:
        while True:
            code = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
            if len(code) == 8 and not db.scalar(select(Utilisateur.id).where(Utilisateur.code_recrutement == code)):
                break
        moi.code_recrutement = code
        db.commit()
    nb = db.scalar(
        select(func.count()).select_from(Volontaire)
        .where(Volontaire.recrute_par_id == moi.id, Volontaire.actif.is_(True))
    )
    return {"code": moi.code_recrutement, "lien": f"{settings.front_url}/?r={moi.code_recrutement}", "nb_recrues": nb}


@router.post("/utilisateurs/inviter", response_model=LienOut, status_code=201)
def inviter(data: InvitationIn, db: Session = Depends(get_db), moi: Utilisateur = Depends(responsable)):
    _email_libre(db, data.email)
    u = Utilisateur(nom=data.nom.strip(), email=data.email.lower() if data.email else None, role=data.role,
                    password_hash="", actif=True)
    db.add(u)
    db.flush()
    return _lien_et_email(db, u, "invitation", moi, data.envoyer_email)


@router.post("/utilisateurs/{uid}/invitation", response_model=LienOut)
def renvoyer_invitation(uid: int, envoyer_email: bool = True, db: Session = Depends(get_db),
                        moi: Utilisateur = Depends(responsable)):
    u = _get_user(db, uid)
    if u.statut != "invite":
        raise HTTPException(400, "Ce compte est déjà activé : utilisez plutôt un lien de réinitialisation")
    return _lien_et_email(db, u, "invitation", moi, envoyer_email)


@router.post("/utilisateurs/{uid}/reinitialisation", response_model=LienOut)
def lien_reinitialisation(uid: int, envoyer_email: bool = True, db: Session = Depends(get_db),
                          moi: Utilisateur = Depends(responsable)):
    u = _get_user(db, uid)
    if u.statut == "invite":
        raise HTTPException(400, "Ce compte n'est pas encore activé : renvoyez plutôt l'invitation")
    if not u.actif:
        raise HTTPException(400, "Réactivez d'abord ce compte")
    return _lien_et_email(db, u, "reinitialisation", moi, envoyer_email)


@router.post("/utilisateurs", response_model=UtilisateurOut, status_code=201)
def creer_utilisateur(data: UtilisateurIn, db: Session = Depends(get_db), _: Utilisateur = Depends(responsable)):
    """Création directe avec mot de passe (alternative à l'invitation)."""
    if not data.password or not data.email:
        raise HTTPException(422, "E-mail et mot de passe (8 caractères minimum) requis")
    _email_libre(db, data.email)
    u = Utilisateur(nom=data.nom, email=data.email.lower(), role=data.role,
                    password_hash=hash_password(data.password), actif=data.actif)
    db.add(u)
    db.commit()
    return _out(db, u)


@router.put("/utilisateurs/{uid}", response_model=UtilisateurOut)
def modifier_utilisateur(uid: int, data: UtilisateurIn, db: Session = Depends(get_db),
                         moi: Utilisateur = Depends(responsable)):
    u = _get_user(db, uid)
    if u.id == moi.id and (data.role != "responsable" or not data.actif):
        raise HTTPException(400, "Vous ne pouvez pas retirer vos propres droits de responsable")
    if u.statut != "invite" and not data.email:
        raise HTTPException(422, "L'e-mail est obligatoire pour un compte activé")
    _email_libre(db, data.email, sauf_id=uid)
    u.nom, u.role, u.actif = data.nom, data.role, data.actif
    u.email = data.email.lower() if data.email else None
    if data.password:
        definir_mot_de_passe(u, data.password)
        jetons.invalider_tous(db, u.id)
    elif not data.actif:
        u.version_session = (u.version_session or 0) + 1  # déconnexion immédiate
    db.commit()
    return _out(db, u)


@router.delete("/utilisateurs/{uid}", status_code=204)
def supprimer_utilisateur(uid: int, db: Session = Depends(get_db), moi: Utilisateur = Depends(responsable)):
    u = _get_user(db, uid)
    if u.statut != "invite":
        raise HTTPException(400, "Seule une invitation non acceptée peut être supprimée ; désactivez plutôt le compte")
    journaliser(db, moi.nom, "invitation_annulee", None, u.nom)
    db.delete(u)
    db.commit()


# ---------------------------------------------------------------- e-mails
def _config_out(c) -> ConfigEmailOut:
    return ConfigEmailOut(
        actif=c.actif, fournisseur=c.fournisseur, hote=c.hote, port=c.port, securite=c.securite,
        utilisateur=c.utilisateur, mot_de_passe_defini=bool(c.mot_de_passe_chiffre),
        expediteur_email=c.expediteur_email, expediteur_nom=c.expediteur_nom,
        dernier_test_ok_at=c.dernier_test_ok_at, url_site=settings.front_url,
    )


@router.get("/email", response_model=ConfigEmailOut)
def lire_config_email(db: Session = Depends(get_db), _: Utilisateur = Depends(responsable)):
    return _config_out(mailer.get_config(db))


@router.put("/email", response_model=ConfigEmailOut)
def ecrire_config_email(data: ConfigEmailIn, db: Session = Depends(get_db), moi: Utilisateur = Depends(responsable)):
    c = mailer.get_config(db)
    if data.actif and (not data.hote.strip() or not data.expediteur_email):
        raise HTTPException(422, "Serveur SMTP et adresse d'expéditeur obligatoires pour activer l'envoi")
    reglage_change = (data.hote.strip(), data.port, data.securite, data.utilisateur.strip()) != (
        c.hote, c.port, c.securite, c.utilisateur
    )
    c.actif, c.fournisseur, c.hote, c.port = data.actif, data.fournisseur, data.hote.strip(), data.port
    c.securite, c.utilisateur = data.securite, data.utilisateur.strip()
    c.expediteur_email = (data.expediteur_email or "").lower()
    c.expediteur_nom = data.expediteur_nom.strip() or "Service volontaires"
    if data.mot_de_passe:
        c.mot_de_passe_chiffre = mailer.chiffrer(data.mot_de_passe)
        reglage_change = True
    if reglage_change:
        c.dernier_test_ok_at = None
    journaliser(db, moi.nom, "config_email", None, f"{'activé' if c.actif else 'désactivé'} — {c.hote or 'non configuré'}")
    db.commit()
    return _config_out(c)


@router.post("/email/test")
def tester_email(data: TestEmailIn, db: Session = Depends(get_db), _: Utilisateur = Depends(responsable)):
    c = mailer.get_config(db)
    sujet, texte, html = mailer.email_test(data.destinataire)
    try:
        mailer.envoyer(c, data.destinataire, sujet, texte, html)
    except mailer.EmailErreur as e:
        raise HTTPException(502, str(e))
    c.dernier_test_ok_at = now_utc()
    db.commit()
    return {"ok": True, "message": f"E-mail de test envoyé à {data.destinataire}"}
