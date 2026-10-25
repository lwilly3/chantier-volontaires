"""Espace de démonstration : données fictives, connexion par rôle, garde-fous."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import demo
from app.db import SessionLocal
from app.main import app as vraie_app
from app.models import Presence, Utilisateur, Volontaire
from tests.test_api import client  # noqa: F401  (fixture : base vide)


def _app_demo() -> FastAPI:
    a = FastAPI()
    for r in vraie_app.router.routes:
        a.router.routes.append(r)
    a.middleware("http")(demo.garde_fou)
    a.include_router(demo.router)
    return a


def test_reinitialisation_cree_un_chantier_fictif(client):  # noqa: F811
    with SessionLocal() as db:
        demo.reinitialiser(db)
        assert db.query(Utilisateur).count() == len(demo.COMPTES)
        assert db.query(Volontaire).count() >= 80
        assert db.query(Presence).count() > 0
        demo.reinitialiser(db)  # idempotent
        assert db.query(Utilisateur).count() == len(demo.COMPTES)


def test_connexion_par_role_et_garde_fous(client):  # noqa: F811
    with SessionLocal() as db:
        demo.reinitialiser(db)
    c = TestClient(_app_demo())
    r = c.post("/api/demo/connexion/cuisine")
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert c.get("/api/admin/couverture", headers=h).status_code == 200
    assert c.get("/api/admin/volontaires", headers=h).status_code == 403  # la cuisine ne voit pas les noms

    h = {"Authorization": f"Bearer {c.post('/api/demo/connexion/responsable').json()['token']}"}
    assert c.post("/api/auth/mot-de-passe", headers=h, json={"ancien": "x", "nouveau": "yyyyyyyyyy"}).status_code == 403
    assert c.put("/api/admin/email", headers=h, json={}).status_code == 403
    assert c.delete("/api/admin/utilisateurs/2", headers=h).status_code == 403
    assert c.put("/api/admin/acces-formulaire", headers=h, json={}).status_code == 403
    assert c.post("/api/demo/reinitialiser", headers=h).status_code == 204

    # Le formulaire public fonctionne avec le code de démo
    assert c.post("/api/public/acces", json={"code": demo.CODE_ACCES}).status_code == 204
