from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Creneau = Literal["journee", "matin", "apres_midi"]
Role = Literal["responsable", "adjoint", "relais", "cuisine", "comite"]


class DispoIn(BaseModel):
    jour: date
    creneau: Creneau = "journee"


class DispoOut(DispoIn):
    model_config = ConfigDict(from_attributes=True)


class VolontaireBase(BaseModel):
    nom: str = Field(min_length=2, max_length=160)
    telephone: str = Field(min_length=6, max_length=30)
    assemblee: str
    competences: list[str] = Field(default_factory=list, max_length=20)
    est_mineur: bool = False
    remarques: str = Field(default="", max_length=1000)

    @field_validator("nom")
    @classmethod
    def _nettoyer_nom(cls, v: str) -> str:
        return " ".join(v.split())


class VolontaireIn(VolontaireBase):
    disponibilites: list[DispoIn] = Field(default_factory=list, max_length=120)


class InscriptionIn(VolontaireIn):
    recrutement: str | None = Field(default=None, max_length=32)  # code ?r= du lien de recrutement


class VolontaireUpdate(VolontaireIn):
    actif: bool | None = None


class VolontairePublicOut(VolontaireBase):
    model_config = ConfigDict(from_attributes=True)
    disponibilites: list[DispoOut]
    token: str


class VolontaireAdminOut(VolontaireBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    token: str
    source: str
    actif: bool
    recrute_par_id: int | None = None
    recrute_par: str | None = None
    created_at: datetime
    updated_at: datetime
    disponibilites: list[DispoOut]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UtilisateurOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nom: str
    email: str | None
    role: Role
    actif: bool
    statut: Literal["actif", "invite", "desactive"]
    invitation_expire_at: datetime | None = None
    invitation_expiree: bool = False
    nb_recrues: int = 0


class UtilisateurIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    role: Role
    password: str | None = Field(default=None, min_length=8, max_length=128)
    actif: bool = True

    @field_validator("email", "password", mode="before")
    @classmethod
    def _vide_vers_none(cls, v):
        return v or None


class InvitationIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    role: Role
    envoyer_email: bool = True

    @field_validator("email", mode="before")
    @classmethod
    def _vide_vers_none(cls, v):
        return v or None


class LienOut(BaseModel):
    """Lien à transmettre (WhatsApp, copier-coller) + résultat de l'envoi par e-mail."""
    utilisateur: UtilisateurOut
    lien: str
    expire_at: datetime
    email_envoye: bool = False
    erreur_email: str | None = None


class MotDePasseIn(BaseModel):
    ancien: str
    nouveau: str = Field(min_length=8, max_length=128)


class JetonInfo(BaseModel):
    type: Literal["invitation", "reinitialisation"]
    nom: str
    email: str | None
    role: Role


class JetonAccepter(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr | None = None  # obligatoire pour une invitation sans e-mail connu

    @field_validator("email", mode="before")
    @classmethod
    def _vide_vers_none(cls, v):
        return v or None


class OublieIn(BaseModel):
    email: EmailStr


class ConfigEmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    actif: bool
    fournisseur: str
    hote: str
    port: int
    securite: Literal["starttls", "ssl", "aucune"]
    utilisateur: str
    mot_de_passe_defini: bool
    expediteur_email: str
    expediteur_nom: str
    dernier_test_ok_at: datetime | None
    url_site: str


class ConfigEmailIn(BaseModel):
    actif: bool
    fournisseur: Literal["brevo", "resend", "gmail", "autre"] = "autre"
    hote: str = Field(default="", max_length=200)
    port: int = Field(default=587, ge=1, le=65535)
    securite: Literal["starttls", "ssl", "aucune"] = "starttls"
    utilisateur: str = Field(default="", max_length=200)
    # Vide = conserver le mot de passe déjà enregistré
    mot_de_passe: str | None = Field(default=None, max_length=500)
    expediteur_email: EmailStr | None = None
    expediteur_nom: str = Field(default="Service volontaires", max_length=120)

    @field_validator("expediteur_email", mode="before")
    @classmethod
    def _vide_vers_none(cls, v):
        return v or None


class TestEmailIn(BaseModel):
    destinataire: EmailStr


class ParametresIO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    nom_chantier: str = Field(min_length=3, max_length=200)
    date_debut: date
    date_fin: date
    plafond_jour: int = Field(ge=1, le=1000)
    seuil_alerte: int = Field(ge=1, le=1000)
    jours_fermes: list[str] = Field(default_factory=list)
    competences: list[str] = Field(min_length=1)
    assemblees: list[str] = Field(min_length=1)
    inscriptions_ouvertes: bool = True
    message_accueil: str = Field(default="", max_length=2000)
    contact_whatsapp: str = Field(default="", max_length=30)

    @field_validator("jours_fermes")
    @classmethod
    def _dates_iso(cls, v: list[str]) -> list[str]:
        return sorted({date.fromisoformat(d).isoformat() for d in v})
