from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import jetons, mailer
from ..config import settings
from ..db import get_db
from ..models import Utilisateur
from ..ratelimit import limit
from ..schemas import JetonAccepter, JetonInfo, LoginIn, MotDePasseIn, OublieIn, UtilisateurOut
from ..security import create_token, current_user, definir_mot_de_passe, verify_password
from ..services import journaliser

router = APIRouter(prefix="/api/auth", tags=["auth"])
_limite_login = Depends(limit("login", settings.rate_limit_login))


def _session(user: Utilisateur) -> dict:
    return {"token": create_token(user), "utilisateur": UtilisateurOut.model_validate(user)}


def _par_email(db: Session, email: str) -> Utilisateur | None:
    return db.scalar(select(Utilisateur).where(func.lower(Utilisateur.email) == email.lower()))


@router.post("/login", dependencies=[_limite_login])
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = _par_email(db, data.email)
    if user is None or not user.actif or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "E-mail ou mot de passe incorrect")
    return _session(user)


@router.get("/me", response_model=UtilisateurOut)
def me(user: Utilisateur = Depends(current_user)):
    return user


@router.post("/mot-de-passe")
def changer_mot_de_passe(data: MotDePasseIn, user: Utilisateur = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(data.ancien, user.password_hash):
        raise HTTPException(400, "Ancien mot de passe incorrect")
    definir_mot_de_passe(user, data.nouveau)
    db.commit()
    return _session(user)  # nouvelle session : les autres appareils sont déconnectés


@router.get("/options")
def options(db: Session = Depends(get_db)):
    """Ce que la page de connexion peut proposer."""
    return {"mot_de_passe_oublie": mailer.email_disponible(db)}


@router.post("/mot-de-passe-oublie", status_code=202, dependencies=[_limite_login])
def mot_de_passe_oublie(data: OublieIn, db: Session = Depends(get_db)):
    """Réponse identique que le compte existe ou non (ne révèle pas les adresses inscrites)."""
    reponse = {"message": "Si un compte actif correspond à cette adresse, un e-mail vient d'être envoyé."}
    if not mailer.email_disponible(db):
        raise HTTPException(503, "L'envoi d'e-mails n'est pas activé. Demande un lien au responsable.")
    user = _par_email(db, data.email)
    if user is None or not user.actif or not user.password_hash:
        return reponse
    token, _ = jetons.creer(db, user, "reinitialisation", "mot de passe oublié")
    journaliser(db, user.nom, "reinitialisation_demandee", None, "Demande depuis la page de connexion")
    db.commit()
    sujet, texte, html = mailer.email_reinitialisation(user.nom, jetons.lien("reinitialisation", token), settings.reinitialisation_minutes)
    try:
        mailer.envoyer(mailer.get_config(db), user.email, sujet, texte, html)
    except mailer.EmailErreur:
        pass  # même réponse pour ne rien révéler ; l'erreur est visible via le test d'envoi
    return reponse


def _jeton_ou_404(db: Session, token: str):
    j = jetons.trouver_valide(db, token)
    if j is None:
        raise HTTPException(404, "Ce lien a expiré ou a déjà été utilisé. Demandes-en un nouveau au responsable.")
    return j


@router.get("/jeton/{token}", response_model=JetonInfo, dependencies=[_limite_login])
def lire_jeton(token: str, db: Session = Depends(get_db)):
    j = _jeton_ou_404(db, token)
    u = j.utilisateur
    return JetonInfo(type=j.type, nom=u.nom, email=u.email, role=u.role)


@router.post("/jeton/{token}", dependencies=[_limite_login])
def utiliser_jeton(token: str, data: JetonAccepter, db: Session = Depends(get_db)):
    j = _jeton_ou_404(db, token)
    u = j.utilisateur
    if j.type == "invitation":
        email = (data.email or u.email or "").lower()
        if not email:
            raise HTTPException(422, "Indique ton adresse e-mail : elle te servira d'identifiant")
        autre = _par_email(db, email)
        if autre is not None and autre.id != u.id:
            raise HTTPException(409, "Cette adresse e-mail est déjà utilisée par un autre compte")
        u.email = email
        u.actif = True
    elif not u.actif:
        raise HTTPException(403, "Ce compte est désactivé")
    definir_mot_de_passe(u, data.password)
    jetons.invalider_tous(db, u.id)  # ce lien et tous les autres liens encore ouverts
    journaliser(
        db, u.nom,
        "invitation_acceptee" if j.type == "invitation" else "mot_de_passe_reinitialise",
        None, u.email or "",
    )
    db.commit()
    return _session(u)
