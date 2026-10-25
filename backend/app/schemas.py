from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Creneau = Literal["journee", "matin", "apres_midi"]
Role = Literal["responsable", "adjoint", "cuisine", "comite"]


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
    email: str
    role: Role
    actif: bool


class UtilisateurIn(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    email: EmailStr
    role: Role
    password: str | None = Field(default=None, min_length=8, max_length=128)
    actif: bool = True


class MotDePasseIn(BaseModel):
    ancien: str
    nouveau: str = Field(min_length=8, max_length=128)


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
