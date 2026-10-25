"""Routes publiques : utilisées par les volontaires, sans compte."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Utilisateur, Volontaire
from ..ratelimit import limit
from ..schemas import InscriptionIn, VolontaireIn, VolontairePublicOut
from ..services import (
    charger_volontaire,
    couverture,
    get_parametres,
    journaliser,
    jours_ouvres,
    normaliser_telephone,
    nouveau_token,
    synchroniser_disponibilites,
    valider_profil,
)

router = APIRouter(prefix="/api/public", tags=["public"])
_limite = Depends(limit("public", settings.rate_limit_public))


@router.get("/config")
def config(db: Session = Depends(get_db)):
    """Tout ce qu'il faut au formulaire : jours, compétences, et remplissage de chaque jour
    (sans aucun nom) pour orienter les volontaires vers les jours où on manque de monde."""
    p = get_parametres(db)
    return {
        "nom_chantier": p.nom_chantier,
        "date_debut": p.date_debut,
        "date_fin": p.date_fin,
        "plafond_jour": p.plafond_jour,
        "inscriptions_ouvertes": p.inscriptions_ouvertes,
        "message_accueil": p.message_accueil,
        "contact_whatsapp": p.contact_whatsapp,
        "competences": p.competences,
        "assemblees": p.assemblees,
        "jours": [d.isoformat() for d in jours_ouvres(p)],
        "remplissage": {
            c["jour"]: {"total": c["total"], "statut": c["statut"]}
            for c in couverture(db, p, detail=False)
        },
    }


@router.post("/inscription", response_model=VolontairePublicOut, status_code=201, dependencies=[_limite])
def inscription(data: InscriptionIn, db: Session = Depends(get_db)):
    p = get_parametres(db)
    if not p.inscriptions_ouvertes:
        raise HTTPException(403, "Les inscriptions sont fermées pour le moment")
    tel = normaliser_telephone(data.telephone)
    if db.scalar(select(Volontaire.id).where(Volontaire.telephone == tel)):
        raise HTTPException(
            409,
            "Ce numéro est déjà inscrit. Utilisez votre lien personnel pour modifier vos "
            "disponibilités, ou demandez-le à un adjoint du service volontaires.",
        )
    v = Volontaire(
        nom=data.nom,
        telephone=tel,
        assemblee=data.assemblee,
        competences=valider_profil(p, data.assemblee, data.competences),
        est_mineur=data.est_mineur,
        remarques=data.remarques.strip(),
        token=nouveau_token(),
        source="public",
        recrute_par_id=getattr(_recruteur(db, data.recrutement), "id", None),
        disponibilites=[],
    )
    db.add(v)
    synchroniser_disponibilites(db, p, v, [d.model_dump() for d in data.disponibilites])
    db.flush()
    journaliser(db, "volontaire", "inscription", v.id, f"{len(v.disponibilites)} jour(s)")
    db.commit()
    return v


def _recruteur(db: Session, code: str | None) -> Utilisateur | None:
    if not code:
        return None
    u = db.scalar(select(Utilisateur).where(Utilisateur.code_recrutement == code.strip()))
    return u if u is not None and u.actif and u.password_hash else None


@router.get("/recruteur/{code}", dependencies=[_limite])
def recruteur(code: str, db: Session = Depends(get_db)):
    """Prénom affiché sur le formulaire (« Inscription proposée par … »)."""
    u = _recruteur(db, code)
    if u is None:
        raise HTTPException(404, "Lien de recrutement inconnu")
    return {"prenom": u.nom.split(" ")[0]}


def _par_token(db: Session, token: str) -> Volontaire:
    v = charger_volontaire(db, token=token)
    if v is None or not v.actif:
        raise HTTPException(404, "Lien invalide ou expiré. Contactez le service volontaires.")
    return v


@router.get("/moi/{token}", response_model=VolontairePublicOut, dependencies=[_limite])
def mon_profil(token: str, db: Session = Depends(get_db)):
    return _par_token(db, token)


@router.put("/moi/{token}", response_model=VolontairePublicOut, dependencies=[_limite])
def modifier_profil(token: str, data: VolontaireIn, db: Session = Depends(get_db)):
    p = get_parametres(db)
    v = _par_token(db, token)
    tel = normaliser_telephone(data.telephone)
    if tel != v.telephone and db.scalar(select(Volontaire.id).where(Volontaire.telephone == tel)):
        raise HTTPException(409, "Ce numéro est déjà utilisé par un autre volontaire")
    v.nom, v.telephone, v.assemblee = data.nom, tel, data.assemblee
    v.competences = valider_profil(p, data.assemblee, data.competences)
    v.est_mineur, v.remarques = data.est_mineur, data.remarques.strip()
    resume = synchroniser_disponibilites(db, p, v, [d.model_dump() for d in data.disponibilites])
    journaliser(db, "volontaire", "modification", v.id, _resume_txt(resume))
    db.commit()
    return v


def _resume_txt(r: dict) -> str:
    return f"+{r['ajoutes']} / -{r['retires']} / ~{r['modifies']} jour(s)"
