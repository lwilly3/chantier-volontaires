from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


ROLES = ("responsable", "adjoint", "cuisine", "comite")
CRENEAUX = ("journee", "matin", "apres_midi")


class Utilisateur(Base):
    __tablename__ = "utilisateurs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(120))
    # Peut rester vide pour une invitation : la personne le saisit en acceptant
    email: Mapped[str | None] = mapped_column(String(200), unique=True, index=True, nullable=True)
    # Vide tant que l'invitation n'a pas été acceptée (aucune connexion possible)
    password_hash: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(20), default="adjoint")
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    # Incrémentée à chaque changement de mot de passe : invalide les sessions ouvertes
    version_session: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    @property
    def statut(self) -> str:
        if not self.password_hash:
            return "invite"
        return "actif" if self.actif else "desactive"


TYPES_JETON = ("invitation", "reinitialisation")


class Jeton(Base):
    """Lien à usage unique (invitation ou réinitialisation). Seule l'empreinte est stockée."""

    __tablename__ = "jetons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(
        ForeignKey("utilisateurs.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(20))
    empreinte: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    utilise_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cree_par: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    utilisateur: Mapped[Utilisateur] = relationship()


class ConfigEmail(Base):
    """Une seule ligne (id = 1) : fournisseur SMTP choisi par le responsable."""

    __tablename__ = "config_email"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actif: Mapped[bool] = mapped_column(Boolean, default=False)
    fournisseur: Mapped[str] = mapped_column(String(30), default="autre")
    hote: Mapped[str] = mapped_column(String(200), default="")
    port: Mapped[int] = mapped_column(Integer, default=587)
    securite: Mapped[str] = mapped_column(String(10), default="starttls")  # starttls | ssl | aucune
    utilisateur: Mapped[str] = mapped_column(String(200), default="")
    mot_de_passe_chiffre: Mapped[str] = mapped_column(Text, default="")
    expediteur_email: Mapped[str] = mapped_column(String(200), default="")
    expediteur_nom: Mapped[str] = mapped_column(String(120), default="Service volontaires")
    dernier_test_ok_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Volontaire(Base):
    __tablename__ = "volontaires"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(160))
    telephone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    assemblee: Mapped[str] = mapped_column(String(80))
    competences: Mapped[list] = mapped_column(JSON, default=list)
    est_mineur: Mapped[bool] = mapped_column(Boolean, default=False)
    remarques: Mapped[str] = mapped_column(Text, default="")
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(20), default="public")  # public | adjoint
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    disponibilites: Mapped[list["Disponibilite"]] = relationship(
        back_populates="volontaire",
        cascade="all, delete-orphan",
        order_by="Disponibilite.jour",
    )


class Disponibilite(Base):
    __tablename__ = "disponibilites"
    __table_args__ = (UniqueConstraint("volontaire_id", "jour", name="uq_dispo_volontaire_jour"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    volontaire_id: Mapped[int] = mapped_column(
        ForeignKey("volontaires.id", ondelete="CASCADE"), index=True
    )
    jour: Mapped[date] = mapped_column(Date, index=True)
    creneau: Mapped[str] = mapped_column(String(20), default="journee")
    # Date à laquelle le volontaire s'est engagé sur ce jour : sert à l'ordre de priorité
    # quand un jour dépasse le plafond (les derniers inscrits passent en réserve).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    volontaire: Mapped[Volontaire] = relationship(back_populates="disponibilites")


class Journal(Base):
    __tablename__ = "journal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    acteur: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(60))
    volontaire_id: Mapped[int | None] = mapped_column(
        ForeignKey("volontaires.id", ondelete="SET NULL"), nullable=True
    )
    details: Mapped[str] = mapped_column(Text, default="")


class Parametres(Base):
    """Une seule ligne (id = 1) : réglages du chantier, modifiables par le responsable."""

    __tablename__ = "parametres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom_chantier: Mapped[str] = mapped_column(String(200))
    date_debut: Mapped[date] = mapped_column(Date)
    date_fin: Mapped[date] = mapped_column(Date)
    plafond_jour: Mapped[int] = mapped_column(Integer, default=50)
    seuil_alerte: Mapped[int] = mapped_column(Integer, default=45)
    jours_fermes: Mapped[list] = mapped_column(JSON, default=list)
    competences: Mapped[list] = mapped_column(JSON, default=list)
    assemblees: Mapped[list] = mapped_column(JSON, default=list)
    inscriptions_ouvertes: Mapped[bool] = mapped_column(Boolean, default=True)
    message_accueil: Mapped[str] = mapped_column(Text, default="")
    contact_whatsapp: Mapped[str] = mapped_column(String(30), default="")
