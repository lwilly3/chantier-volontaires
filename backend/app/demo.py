"""Espace de démonstration (variable DEMO=1).

Données entièrement fictives, recréées au démarrage et chaque nuit. Une connexion en un clic
par rôle permet aux collaborateurs d'essayer l'application sans compte. Les actions qui
pourraient casser la démo pour les autres (mots de passe, e-mails, comptes) sont bloquées.
"""
import asyncio
import random
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .config import settings
from .db import SessionLocal, get_db
from .models import (
    ConfigEmail,
    Disponibilite,
    Jeton,
    Journal,
    Parametres,
    Presence,
    Utilisateur,
    Volontaire,
)
from .ratelimit import limit
from .security import create_token, equipe, hash_password
from .services import COMPETENCES_DEFAUT, aujourd_hui, jours_ouvres, nouveau_token

CODE_ACCES = "DEMO"
ASSEMBLEES_DEMO = ["Assemblée Centre", "Assemblée Nord"]
MDP_PRESENCES = "demo"
MDP_COMPTES = "demo-chantier"

COMPTES = [
    # id, rôle, nom, e-mail
    (1, "responsable", "Responsable (démo)", "responsable@demo.volontaires.invalid"),
    (2, "adjoint", "Adjoint (démo)", "adjoint@demo.volontaires.invalid"),
    (3, "relais", "Homme clé (démo)", "hommecle@demo.volontaires.invalid"),
    (4, "cuisine", "Cuisine (démo)", "cuisine@demo.volontaires.invalid"),
    (5, "comite", "Comité (démo)", "comite@demo.volontaires.invalid"),
]
LIBELLES = {
    "responsable": "Responsable",
    "adjoint": "Adjoint",
    "relais": "Homme clé",
    "cuisine": "Cuisine",
    "comite": "Comité",
}

PRENOMS = [
    "Joël", "Mireille", "Arnaud", "Carine", "Hervé", "Sandrine", "Yannick", "Brigitte", "Cyrille", "Pauline",
    "Serge", "Nadège", "Roger", "Vanessa", "Alain", "Chantal", "Paul", "Marie", "Samuel", "Esther", "Daniel",
    "Ruth", "Josué", "Lydie", "Pierre", "Sarah", "André", "Grâce", "Michel", "Hélène", "Éric", "Judith",
]
NOMS = [
    "Kouam", "Tagne", "Fokou", "Mbida", "Essama", "Belinga", "Owona", "Zambo", "Ayissi", "Ekotto", "Abega",
    "Ngono", "Ekane", "Tchoua", "Fotso", "Nkeng", "Abena", "Essomba", "Kamga", "Moukoko", "Bilong", "Ndjock",
]
NOTES = ["", "", "", "Pluie le matin", "Livraison de ciment en retard", "Bonne journée", "Coupure d'électricité l'après-midi"]


# ------------------------------------------------------------------ données fictives
def _lundi(d: date) -> date:
    return d - timedelta(days=d.weekday())


def reinitialiser(db: Session) -> None:
    """Efface tout et recrée un chantier fictif « en cours » : 2 semaines passées, 6 à venir."""
    for modele in (Presence, Journal, Disponibilite, Volontaire, Jeton, ConfigEmail, Utilisateur, Parametres):
        db.execute(delete(modele))
    db.flush()

    rnd = random.Random(2026)
    auj = aujourd_hui()
    debut = _lundi(auj) - timedelta(weeks=2)
    fin = debut + timedelta(weeks=8, days=-2)  # samedi de la 8e semaine

    p = Parametres(
        id=1,
        nom_chantier="Rénovation de la Salle du Royaume — démo",
        date_debut=debut,
        date_fin=fin,
        plafond_jour=50,
        seuil_alerte=45,
        jours_fermes=[],
        competences=COMPETENCES_DEFAUT,
        assemblees=ASSEMBLEES_DEMO,
        inscriptions_ouvertes=True,
        message_accueil=(
            "Espace de démonstration : inscris-toi avec un faux nom pour essayer. "
            "Tout est effacé chaque nuit."
        ),
        code_acces_actif=True,
        code_acces=CODE_ACCES,
        compter_mineurs_plafond=False,
        responsable_donnees="Responsable du service volontaires (démo)",
        presences_actif=True,
        presences_mdp_hash=hash_password(MDP_PRESENCES),
    )
    db.add(p)

    mdp = hash_password(MDP_COMPTES)
    users = {}
    for uid, role, nom, email in COMPTES:
        u = Utilisateur(id=uid, nom=nom, email=email, password_hash=mdp, role=role, actif=True)
        if role == "relais":
            u.code_recrutement = "DEMOHC"
        users[role] = u
        db.add(u)
    db.flush()

    jours = jours_ouvres(p)
    passes = [j for j in jours if j < auj]
    # Quelques jours très demandés (samedis) pour montrer la réserve
    samedis = [j for j in jours if j.weekday() == 5]

    ordre = 0
    base_ts = datetime.combine(debut - timedelta(days=30), time(8), tzinfo=timezone.utc)
    vus: set[str] = set()
    nb = 0
    while nb < 95:
        nom = f"{rnd.choice(PRENOMS)} {rnd.choice(NOMS)}"
        if nom in vus:
            continue
        vus.add(nom)
        profil = rnd.random()
        if profil < 0.55:  # surtout le samedi
            choisis = [j for j in samedis if rnd.random() < 0.9] + [j for j in jours if rnd.random() < 0.05]
        elif profil < 0.8:  # quelques jours en semaine
            choisis = rnd.sample(jours, rnd.randint(3, 10))
        else:  # très disponible
            choisis = [j for j in jours if rnd.random() < 0.45]
        choisis = sorted(set(choisis))
        if not choisis:
            continue
        source = "public"
        recruteur = None
        if nb % 6 == 0:
            recruteur = users["relais"].id
        elif nb % 11 == 0:
            source = "adjoint"
        v = Volontaire(
            nom=nom,
            telephone=f"+999{nb + 1:08d}",  # indicatif inexistant : aucun vrai numéro
            assemblee=ASSEMBLEES_DEMO[nb % 2],
            competences=rnd.sample(COMPETENCES_DEFAUT, rnd.randint(1, 3)),
            nb_mineurs=1 if nb % 9 == 0 else (2 if nb % 23 == 0 else 0),
            remarques="Disponible seulement après 10 h" if nb % 17 == 0 else "",
            token=nouveau_token(),
            source=source,
            recrute_par_id=recruteur,
            actif=nb % 31 != 30,
        )
        for j in choisis:
            ordre += 1
            creneau = rnd.choice(["journee"] * 5 + ["matin", "apres_midi"])
            v.disponibilites.append(
                Disponibilite(jour=j, creneau=creneau, created_at=base_ts + timedelta(minutes=ordre))
            )
        db.add(v)
        nb += 1

    db.flush()
    # Présents constatés pour la plupart des jours passés
    for j in passes:
        if rnd.random() < 0.15:
            continue  # quelques jours non renseignés : la saisie reste facultative
        prevus = sum(
            1 for v in db.query(Volontaire).filter(Volontaire.actif.is_(True)) for d in v.disponibilites if d.jour == j
        )
        prevus = min(prevus, p.plafond_jour)
        taux = 0.95 if j.weekday() == 5 else rnd.uniform(0.65, 0.85)
        db.add(
            Presence(
                jour=j,
                adultes=max(0, round(prevus * taux)),
                mineurs=rnd.choice([None, 0, 1, 2, 3]),
                note=rnd.choice(NOTES),
                saisi_par=rnd.choice(["Adjoint (démo)", "Frère Ekotto (lien présents)"]),
            )
        )

    for i, (action, details) in enumerate(
        [
            ("inscription", "Inscription via le formulaire"),
            ("modification", "Disponibilités modifiées"),
            ("ajout", "Ajouté par l'équipe"),
            ("desactivation", "Désistement"),
        ]
    ):
        db.add(
            Journal(
                acteur=COMPTES[i % 3][2],
                action=action,
                details=details,
                created_at=datetime.now(timezone.utc) - timedelta(hours=5 - i),
            )
        )
    db.commit()


# ------------------------------------------------------------------ remise à zéro nocturne
async def boucle_nocturne() -> None:
    """Réinitialise la démo chaque nuit vers 3 h (heure du chantier)."""
    tz = ZoneInfo(settings.timezone)
    while True:
        maintenant = datetime.now(tz)
        prochain = datetime.combine(maintenant.date() + timedelta(days=1), time(3), tzinfo=tz)
        await asyncio.sleep((prochain - maintenant).total_seconds())
        with SessionLocal() as db:
            reinitialiser(db)


# ------------------------------------------------------------------ garde-fous
BLOQUES = [
    ("PUT", "/api/admin/email"),
    ("POST", "/api/admin/email/test"),
    ("POST", "/api/auth/mot-de-passe"),
    ("POST", "/api/auth/mot-de-passe-oublie"),
    ("PUT", "/api/admin/presences-acces"),
    ("PUT", "/api/admin/acces-formulaire"),
    ("PUT", "/api/admin/utilisateurs/"),
    ("DELETE", "/api/admin/utilisateurs/"),
    ("POST", "/api/admin/utilisateurs/"),
    ("POST", "/api/admin/fin-de-projet"),  # renvoi d'invitation, réinitialisation d'un compte démo
]


async def garde_fou(request: Request, call_next):
    chemin = request.url.path
    for methode, prefixe in BLOQUES:
        if request.method == methode and (chemin == prefixe or (prefixe.endswith("/") and chemin.startswith(prefixe))):
            if chemin == "/api/admin/utilisateurs/inviter":
                break  # créer une invitation fictive reste possible
            return JSONResponse(
                {"detail": "Désactivé dans l'espace de démonstration."}, status_code=403
            )
    return await call_next(request)


# ------------------------------------------------------------------ routes
router = APIRouter(prefix="/api/demo", tags=["démo"])


@router.get("/infos")
def infos():
    return {
        "code_acces": CODE_ACCES,
        "mdp_presences": MDP_PRESENCES,
        "roles": [{"role": r, "libelle": LIBELLES[r]} for _, r, _, _ in COMPTES],
    }


@router.post("/connexion/{role}", dependencies=[Depends(limit("demo", 30))])
def connexion(role: str, db: Session = Depends(get_db)):
    from .schemas import UtilisateurOut

    user = db.query(Utilisateur).filter(Utilisateur.role == role, Utilisateur.email.like("%@demo.volontaires.invalid")).first()
    if user is None:
        raise HTTPException(404, "Rôle inconnu")
    return {"token": create_token(user), "utilisateur": UtilisateurOut.model_validate(user)}


@router.post("/reinitialiser", status_code=204, dependencies=[Depends(equipe)])
def reinitialiser_maintenant(db: Session = Depends(get_db)):
    reinitialiser(db)
