"""Règles métier : dates du chantier, téléphones, disponibilités et couverture par jour."""
import re
import secrets
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .models import CRENEAUX, Disponibilite, Journal, Parametres, Volontaire, now_utc

COMPETENCES_DEFAUT = [
    "Manœuvre / aide générale",
    "Maçonnerie",
    "Carrelage",
    "Électricité",
    "Plomberie",
    "Peinture",
    "Menuiserie",
    "Soudure / ferronnerie",
    "Charpente / toiture",
    "Plâtrerie / faux plafond",
    "Nettoyage",
    "Transport / conduite",
]
ASSEMBLEES_DEFAUT = ["Kambo Logement", "Kambo Pariso"]


def aujourd_hui() -> date:
    return datetime.now(ZoneInfo(settings.timezone)).date()


def get_parametres(db: Session) -> Parametres:
    p = db.get(Parametres, 1)
    if p is None:
        p = Parametres(
            id=1,
            nom_chantier="Rénovation de la Salle du Royaume — Kambo",
            date_debut=date(2026, 11, 23),
            date_fin=date(2027, 1, 23),
            plafond_jour=50,
            seuil_alerte=45,
            jours_fermes=["2026-12-25", "2027-01-01"],
            competences=COMPETENCES_DEFAUT,
            assemblees=ASSEMBLEES_DEFAUT,
            inscriptions_ouvertes=True,
            message_accueil=(
                "Merci de vous proposer pour le chantier ! Indiquez vos compétences et les jours "
                "où vous pouvez venir. Vous pourrez modifier vos disponibilités à tout moment "
                "grâce à votre lien personnel."
            ),
            contact_whatsapp="",
        )
        db.add(p)
        db.commit()
    return p


def jours_ouvres(p: Parametres) -> list[date]:
    """Lundi → samedi entre les dates du chantier, hors jours fermés."""
    fermes = set(p.jours_fermes or [])
    jours, d = [], p.date_debut
    while d <= p.date_fin:
        if d.weekday() < 6 and d.isoformat() not in fermes:
            jours.append(d)
        d += timedelta(days=1)
    return jours


def normaliser_telephone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 9 and digits[0] in "623":  # numéro camerounais sans indicatif
        digits = "237" + digits
    if not 8 <= len(digits) <= 15:
        raise HTTPException(422, "Numéro de téléphone invalide")
    return "+" + digits


def nouveau_token() -> str:
    return secrets.token_urlsafe(18)


def valider_profil(p: Parametres, assemblee: str, competences: list[str]) -> list[str]:
    if assemblee not in p.assemblees:
        raise HTTPException(422, "Assemblée inconnue")
    autorisees = set(p.competences) | {"Autre"}
    propres = [c for c in dict.fromkeys(competences) if c in autorisees]
    return propres


def synchroniser_disponibilites(
    db: Session, p: Parametres, v: Volontaire, dispos: list[dict]
) -> dict:
    """Remplace les disponibilités du volontaire en conservant l'ancienneté des jours
    déjà choisis (priorité en cas de dépassement du plafond). Retourne un résumé."""
    valides = set(jours_ouvres(p))
    voulu: dict[date, str] = {}
    for item in dispos:
        jour, creneau = item["jour"], item["creneau"]
        if creneau not in CRENEAUX:
            raise HTTPException(422, f"Créneau invalide : {creneau}")
        if jour not in valides:
            raise HTTPException(422, f"Le {jour.isoformat()} n'est pas un jour de chantier")
        voulu[jour] = creneau

    existants = {d.jour: d for d in v.disponibilites}
    ajoutes = retires = modifies = 0
    for jour, d in list(existants.items()):
        if jour not in voulu:
            v.disponibilites.remove(d)
            retires += 1
        elif d.creneau != voulu[jour]:
            d.creneau = voulu[jour]
            modifies += 1
    for jour, creneau in voulu.items():
        if jour not in existants:
            v.disponibilites.append(Disponibilite(jour=jour, creneau=creneau, created_at=now_utc()))
            ajoutes += 1
    return {"ajoutes": ajoutes, "retires": retires, "modifies": modifies}


def journaliser(db: Session, acteur: str, action: str, volontaire_id: int | None, details: str = ""):
    db.add(Journal(acteur=acteur, action=action, volontaire_id=volontaire_id, details=details))


def statut_jour(total: int, p: Parametres) -> str:
    if total >= p.plafond_jour:
        return "complet"
    if total >= p.seuil_alerte:
        return "presque"
    if total == 0:
        return "vide"
    return "ok"


def couverture(db: Session, p: Parametres, detail: bool = True) -> list[dict]:
    jours = jours_ouvres(p)
    if not jours:
        return []
    rows = db.execute(
        select(Disponibilite.jour, Disponibilite.creneau, Volontaire.assemblee, Volontaire.competences)
        .join(Volontaire)
        .where(Volontaire.actif.is_(True))
        .where(Disponibilite.jour >= jours[0], Disponibilite.jour <= jours[-1])
    ).all()

    par_jour: dict[date, list] = defaultdict(list)
    for r in rows:
        par_jour[r.jour].append(r)

    resultat = []
    for j in jours:
        lignes = par_jour.get(j, [])
        creneaux = Counter(r.creneau for r in lignes)
        total = len(lignes)
        entree = {
            "jour": j.isoformat(),
            "total": total,
            "presents": min(total, p.plafond_jour),
            "reserve": max(0, total - p.plafond_jour),
            "matin": creneaux["journee"] + creneaux["matin"],
            "apres_midi": creneaux["journee"] + creneaux["apres_midi"],
            "statut": statut_jour(total, p),
        }
        if detail:
            entree["journee"] = creneaux["journee"]
            entree["par_assemblee"] = dict(Counter(r.assemblee for r in lignes))
            comp = Counter()
            for r in lignes:
                comp.update(r.competences or [])
            entree["par_competence"] = dict(comp.most_common())
        resultat.append(entree)
    return resultat


def volontaires_du_jour(db: Session, p: Parametres, jour: date) -> list[dict]:
    rows = db.execute(
        select(Disponibilite, Volontaire)
        .join(Volontaire)
        .where(Volontaire.actif.is_(True), Disponibilite.jour == jour)
        .order_by(Disponibilite.created_at, Disponibilite.id)
    ).all()
    liste = []
    for rang, (d, v) in enumerate(rows, start=1):
        liste.append(
            {
                "rang": rang,
                "en_reserve": rang > p.plafond_jour,
                "creneau": d.creneau,
                "volontaire_id": v.id,
                "nom": v.nom,
                "telephone": v.telephone,
                "assemblee": v.assemblee,
                "competences": v.competences or [],
                "est_mineur": v.est_mineur,
            }
        )
    return liste


def charger_volontaire(db: Session, **filtre) -> Volontaire | None:
    return db.scalar(
        select(Volontaire).options(selectinload(Volontaire.disponibilites)).filter_by(**filtre)
    )
