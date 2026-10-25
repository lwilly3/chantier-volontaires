import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
# TEST_DATABASE_URL permet de lancer les tests sur PostgreSQL (sinon SQLite temporaire)
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", f"sqlite:///{_db}")
os.environ["JWT_SECRET"] = "secret-de-test-suffisamment-long-pour-hs256"
os.environ["ADMIN_EMAIL"] = "chef@test.cm"
os.environ["ADMIN_PASSWORD"] = "motdepasse123"
os.environ["RATE_LIMIT_PUBLIC"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import ratelimit  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    ratelimit.reset()
    with TestClient(app) as c:
        yield c


def admin_headers(c):
    r = c.post("/api/auth/login", json={"email": "chef@test.cm", "password": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def payload(tel="677000001", jours=None, nom="Jean Mbarga"):
    return {
        "nom": nom,
        "telephone": tel,
        "assemblee": "Kambo Pariso",
        "competences": ["Maçonnerie", "Inconnue"],
        "majeur_confirme": True,
        "disponibilites": [{"jour": j, "creneau": "journee"} for j in (jours or ["2026-11-23", "2026-11-28"])],
    }


def test_config_publique(client):
    r = client.get("/api/public/config")
    assert r.status_code == 200
    data = r.json()
    assert data["plafond_jour"] == 50
    assert "2026-11-29" not in data["jours"]  # dimanche exclu
    assert "2026-12-25" not in data["jours"]  # jour fermé
    assert data["jours"][0] == "2026-11-23"


def test_inscription_et_lien_personnel(client):
    r = client.post("/api/public/inscription", json=payload())
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["telephone"] == "+237677000001"
    assert v["competences"] == ["Maçonnerie"]  # compétence inconnue filtrée
    token = v["token"]

    # doublon de téléphone (autre format)
    r = client.post("/api/public/inscription", json=payload(tel="+237 677 00 00 01"))
    assert r.status_code == 409

    # modification via le lien personnel
    p = payload(jours=["2026-11-28", "2026-11-30"])
    p["disponibilites"][1]["creneau"] = "matin"
    r = client.put(f"/api/public/moi/{token}", json=p)
    assert r.status_code == 200
    assert [d["jour"] for d in r.json()["disponibilites"]] == ["2026-11-28", "2026-11-30"]

    assert client.get("/api/public/moi/faux-token").status_code == 404


def test_jour_hors_chantier_refuse(client):
    r = client.post("/api/public/inscription", json=payload(jours=["2026-11-29"]))
    assert r.status_code == 422


def test_couverture_et_plafond(client):
    h = admin_headers(client)
    r = client.put("/api/admin/parametres", headers=h, json={
        **client.get("/api/admin/parametres", headers=h).json(), "plafond_jour": 2, "seuil_alerte": 2,
    })
    assert r.status_code == 200, r.text
    for i in range(3):
        assert client.post("/api/public/inscription", json=payload(tel=f"67700000{i}", nom=f"Frère {i}")).status_code == 201

    cov = client.get("/api/admin/couverture", headers=h).json()
    lundi = next(j for j in cov["jours"] if j["jour"] == "2026-11-23")
    assert lundi["total"] == 3 and lundi["reserve"] == 1 and lundi["statut"] == "complet"
    assert cov["resume"]["volontaires"] == 3

    jour = client.get("/api/admin/jours/2026-11-23", headers=h).json()
    assert [v["en_reserve"] for v in jour["volontaires"]] == [False, False, True]
    assert jour["volontaires"][2]["nom"] == "Frère 2"  # dernier inscrit en réserve


def test_droits_par_role(client):
    h = admin_headers(client)
    r = client.post("/api/admin/utilisateurs", headers=h, json={
        "nom": "Cuisine", "email": "cuisine@test.cm", "role": "cuisine", "password": "cuisine12345",
    })
    assert r.status_code == 201
    t = client.post("/api/auth/login", json={"email": "cuisine@test.cm", "password": "cuisine12345"}).json()["token"]
    hc = {"Authorization": f"Bearer {t}"}
    assert client.get("/api/admin/couverture", headers=hc).status_code == 200
    assert client.get("/api/admin/volontaires", headers=hc).status_code == 403
    assert client.get("/api/admin/volontaires").status_code == 401


def test_admin_crud_export_journal(client):
    h = admin_headers(client)
    r = client.post("/api/admin/volontaires", headers=h, json=payload(tel="699111222"))
    assert r.status_code == 201
    vid, ancien = r.json()["id"], r.json()["token"]
    assert r.json()["source"] == "adjoint"

    r = client.post(f"/api/admin/volontaires/{vid}/nouveau-lien", headers=h)
    assert r.json()["token"] != ancien
    assert client.get(f"/api/public/moi/{ancien}").status_code == 404

    p = payload(tel="699111222")
    r = client.put(f"/api/admin/volontaires/{vid}", headers=h, json={**p, "actif": False})
    assert r.status_code == 200 and r.json()["actif"] is False
    assert client.get("/api/admin/volontaires", headers=h).json() == []
    assert len(client.get("/api/admin/volontaires?statut=tous", headers=h).json()) == 1

    csv = client.get("/api/admin/export/volontaires.csv", headers=h)
    assert csv.status_code == 200 and "Jean Mbarga" in csv.text

    actions = [j["action"] for j in client.get("/api/admin/journal", headers=h).json()]
    assert {"inscription", "nouveau_lien", "desactivation"} <= set(actions)

    assert client.delete(f"/api/admin/volontaires/{vid}", headers=h).status_code == 204


def test_inscriptions_fermees(client):
    h = admin_headers(client)
    params = client.get("/api/admin/parametres", headers=h).json()
    client.put("/api/admin/parametres", headers=h, json={**params, "inscriptions_ouvertes": False})
    assert client.post("/api/public/inscription", json=payload()).status_code == 403
