"""Règles métier : dates du chantier, téléphones, disponibilités et couverture par jour."""
import hashlib
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
ASSEMBLEES_DEFAUT = ["Assemblée A", "Assemblée B"]  # à renommer dans Réglages


def aujourd_hui() -> date:
    return datetime.now(ZoneInfo(settings.timezone)).date()


def get_parametres(db: Session) -> Parametres:
    p = db.get(Parametres, 1)
    if p is None:
        p = Parametres(
            id=1,
            nom_chantier="Rénovation de la Salle du Royaume",
            date_debut=date(2026, 11, 23),
            date_fin=date(2027, 1, 23),
            plafond_jour=50,
            seuil_alerte=45,
            jours_fermes=["2026-12-25", "2027-01-01"],
            competences=COMPETENCES_DEFAUT,
            assemblees=ASSEMBLEES_DEFAUT,
            inscriptions_ouvertes=True,
            message_accueil=(
                "Merci de te proposer pour le chantier ! Indique tes compétences et les jours "
                "où tu peux venir. Tu pourras modifier tes disponibilités à tout moment "
                "grâce à ton lien personnel."
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
    if settings.demo:
        return numero_fictif(digits)
    return "+" + digits


def numero_fictif(digits: str) -> str:
    """Démo : aucun vrai numéro n'est enregistré. L'indicatif +999 n'est attribué à aucun pays,
    WhatsApp le refuse : personne ne peut être contacté par erreur. Un même numéro saisi donne
    toujours le même numéro fictif (la détection des doublons reste possible)."""
    if digits.startswith("999") and len(digits) == 11:
        return "+" + digits
    return "+999" + str(int(hashlib.sha256(digits.encode()).hexdigest(), 16) % 10**8).zfill(8)


def nouveau_token() -> str:
    return secrets.token_urlsafe(18)


def valider_profil(p: Parametres, assemblee: str, competences: list[str]) -> list[str]:
    if assemblee not in p.assemblees:
        raise HTTPException(422, "Assemblée inconnue")
    autorisees = set(p.competences) | {"Autre"}
    propres = [c for c in dict.fromkeys(competences) if c in autorisees]
    return propres


def synchroniser_disponibilites(
    db: Session, p: Parametres, v: Volontaire, dispos: list[dict], figer_avant: date | None = None
) -> dict:
    """Remplace les disponibilités du volontaire en conservant l'ancienneté des jours
    déjà choisis (priorité en cas de dépassement du plafond). Retourne un résumé.

    figer_avant : les jours antérieurs à cette date restent tels qu'ils sont (ajouts, retraits
    et changements de créneau demandés sur ces jours sont ignorés).

    Un jour déjà enregistré qui n'est plus un jour de chantier (dates ou jours fermés modifiés
    dans les réglages) est retiré sans erreur ; seul l'ajout d'un nouveau jour invalide est refusé."""
    valides = set(jours_ouvres(p))
    deja = {d.jour for d in v.disponibilites}
    voulu: dict[date, str] = {}
    for item in dispos:
        jour, creneau = item["jour"], item["creneau"]
        if creneau not in CRENEAUX:
            raise HTTPException(422, f"Créneau invalide : {creneau}")
        if figer_avant and jour < figer_avant:
            continue
        if jour not in valides:
            if jour in deja:
                continue  # jour devenu hors chantier : retiré à l'enregistrement
            raise HTTPException(422, f"Le {jour.strftime('%d/%m/%Y')} n'est pas un jour de chantier")
        voulu[jour] = creneau

    existants = {d.jour: d for d in v.disponibilites}
    if figer_avant:
        for jour, d in existants.items():
            if jour < figer_avant:
                voulu[jour] = d.creneau
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


def etat_jours_volontaires(db: Session, valides: set[date]) -> dict[str, set[int]]:
    """Pour les volontaires actifs, par rapport à un ensemble de jours de chantier :
    - hors_dates : ceux qui ont au moins un jour enregistré hors de ces jours ;
    - sans_jour : ceux qui n'ont aucun jour parmi ces jours (y compris aucun jour du tout)."""
    actifs = set(db.scalars(select(Volontaire.id).where(Volontaire.actif.is_(True))))
    dans, hors = set(), set()
    for vid, jour in db.execute(
        select(Disponibilite.volontaire_id, Disponibilite.jour).join(Volontaire).where(Volontaire.actif.is_(True))
    ):
        (dans if jour in valides else hors).add(vid)
    return {"hors_dates": hors, "sans_jour": actifs - dans}


def jours_figes_avant(p: Parametres) -> date | None:
    """Date à partir de laquelle un volontaire peut encore modifier ses jours (None = tout modifiable)."""
    return aujourd_hui() if p.figer_jours_passes else None


def poids(nb_mineurs: int | None, p: Parametres) -> int:
    """Places occupées par un volontaire : lui seul, ou lui + ses mineurs si le réglage l'exige."""
    return 1 + ((nb_mineurs or 0) if p.compter_mineurs_plafond else 0)


def repartir(lignes: list, p: Parametres) -> list[bool]:
    """Pour des lignes triées par ordre d'engagement, indique qui passe en réserve.
    Ordre strict : dès qu'un volontaire ne rentre plus sous le plafond, lui et les suivants
    sont en réserve (les premiers engagés restent prioritaires)."""
    occupe, plein, reserve = 0, False, []
    for ligne in lignes:
        w = poids(ligne.nb_mineurs, p)
        if not plein and occupe + w <= p.plafond_jour:
            occupe += w
            reserve.append(False)
        else:
            plein = True
            reserve.append(True)
    return reserve


def couverture(db: Session, p: Parametres, detail: bool = True) -> list[dict]:
    jours = jours_ouvres(p)
    if not jours:
        return []
    rows = db.execute(
        select(Disponibilite.jour, Disponibilite.creneau, Volontaire.assemblee, Volontaire.competences,
               Volontaire.nb_mineurs, Disponibilite.created_at, Disponibilite.id)
        .join(Volontaire)
        .where(Volontaire.actif.is_(True))
        .where(Disponibilite.jour >= jours[0], Disponibilite.jour <= jours[-1])
    ).all()

    par_jour: dict[date, list] = defaultdict(list)
    for r in rows:
        par_jour[r.jour].append(r)

    resultat = []
    for j in jours:
        lignes = sorted(par_jour.get(j, []), key=lambda r: (r.created_at, r.id))
        creneaux = Counter(r.creneau for r in lignes)
        en_reserve = repartir(lignes, p)
        attendus = [r for r, res in zip(lignes, en_reserve) if not res]
        mineurs = sum(r.nb_mineurs or 0 for r in attendus)
        demande = sum(poids(r.nb_mineurs, p) for r in lignes)  # places demandées
        entree = {
            "jour": j.isoformat(),
            "total": len(lignes),
            # volontaires adultes attendus (hors réserve)
            "presents": len(attendus),
            "reserve": sum(en_reserve),
            # mineurs à la charge des volontaires attendus : repas, sécurité
            "mineurs": mineurs,
            "occupation": sum(poids(r.nb_mineurs, p) for r in attendus),
            "matin": creneaux["journee"] + creneaux["matin"],
            "apres_midi": creneaux["journee"] + creneaux["apres_midi"],
            "statut": statut_jour(demande, p),
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
    en_reserve = repartir([v for _, v in rows], p)
    liste = []
    for rang, ((d, v), res) in enumerate(zip(rows, en_reserve), start=1):
        liste.append(
            {
                "rang": rang,
                "en_reserve": res,
                "creneau": d.creneau,
                "volontaire_id": v.id,
                "nom": v.nom,
                "telephone": v.telephone,
                "assemblee": v.assemblee,
                "competences": v.competences or [],
                "est_mineur": v.est_mineur,
                "nb_mineurs": v.nb_mineurs or 0,
            }
        )
    return liste


def charger_volontaire(db: Session, **filtre) -> Volontaire | None:
    return db.scalar(
        select(Volontaire).options(selectinload(Volontaire.disponibilites)).filter_by(**filtre)
    )
