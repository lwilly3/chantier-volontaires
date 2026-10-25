"""Configuration lue depuis les variables d'environnement (Dokploy → onglet Environment)."""
import os


def _list(name: str, default: str = "") -> list[str]:
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
    jwt_secret: str = os.getenv("JWT_SECRET", "change-moi-en-production")
    jwt_hours: int = int(os.getenv("JWT_HOURS", "12"))
    cors_origins: list[str] = _list(
        "CORS_ORIGINS", "http://localhost:5173,https://volontaires.sallekambo.org"
    )
    # Compte responsable créé au premier démarrage s'il n'existe aucun utilisateur
    admin_email: str = os.getenv("ADMIN_EMAIL", "")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "")
    admin_nom: str = os.getenv("ADMIN_NOM", "Responsable volontaires")
    # Limitation anti-abus des routes publiques (requêtes par minute et par IP)
    rate_limit_public: int = int(os.getenv("RATE_LIMIT_PUBLIC", "20"))
    rate_limit_login: int = int(os.getenv("RATE_LIMIT_LOGIN", "10"))
    timezone: str = os.getenv("TZ_CHANTIER", "Africa/Douala")
    # Adresse publique du site, utilisée dans les liens envoyés (invitations, réinitialisations)
    front_url: str = os.getenv("FRONT_URL", "").rstrip("/")
    invitation_heures: int = int(os.getenv("INVITATION_HEURES", "72"))
    reinitialisation_minutes: int = int(os.getenv("REINITIALISATION_MINUTES", "60"))


settings = Settings()

if not settings.front_url:
    https = [o for o in settings.cors_origins if o.startswith("https://")]
    settings.front_url = (https or settings.cors_origins or ["http://localhost:5173"])[0].rstrip("/")

if settings.database_url.startswith("postgres://"):
    # Dokploy fournit parfois l'URL au format postgres:// → driver psycopg 3
    settings.database_url = settings.database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif settings.database_url.startswith("postgresql://"):
    settings.database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
