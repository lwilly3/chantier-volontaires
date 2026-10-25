from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .config import settings
from .db import SessionLocal
from .models import Utilisateur
from .routers import admin, auth, presences, public
from .security import hash_password
from .services import get_parametres


def bootstrap() -> None:
    """Crée les paramètres par défaut et le premier compte responsable (une seule fois)."""
    if not settings.database_url.startswith("sqlite") and len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET doit faire au moins 32 caractères en production")
    with SessionLocal() as db:
        get_parametres(db)
        nb = db.scalar(select(func.count()).select_from(Utilisateur))
        if nb == 0 and settings.admin_email and settings.admin_password:
            db.add(
                Utilisateur(
                    nom=settings.admin_nom,
                    email=settings.admin_email.lower(),
                    password_hash=hash_password(settings.admin_password),
                    role="responsable",
                )
            )
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap()
    yield


app = FastAPI(title="Chantier Kambo — Service volontaires", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(presences.admin)
app.include_router(presences.lien)


@app.get("/api/health")
def health():
    return {"status": "ok"}
