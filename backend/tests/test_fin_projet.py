"""Fin du projet : anonymisation ou effacement des données personnelles."""
from datetime import date

import pytest

from tests.test_api import admin_headers, client, payload  # noqa: F401,I001  (fixture ; à importer en premier : variables d'env de test)
from app.routers import admin as admin_router  # noqa: E402
from app.routers import presences as pres_router  # noqa: E402
from tests.test_relais import creer_relais

URL = "/api/admin/fin-de-projet"


@pytest.fixture(autouse=True)
def fin_de_chantier(monkeypatch):
    monkeypatch.setattr(pres_router, "aujourd_hui", lambda: date(2027, 1, 25))
    monkeypatch.setattr(admin_router, "aujourd_hui", lambda: date(2027, 1, 25))


def _preparer(c, h):
    _, hr = creer_relais(c, h)
    v1 = c.post("/api/admin/volontaires", headers=hr, json=payload(tel="690000001", nom="Paul Ngono")).json()
    c.post("/api/admin/volontaires", headers=h, json=payload(tel="690000002", nom="Marie Ekane"))
    r = c.put("/api/admin/presences/2026-11-23", headers=h, json={"adultes": 12, "note": "Paul en retard"})
    assert r.status_code == 200, r.text
    return v1, hr


def test_confirmation_et_mot_de_passe_obligatoires(client):  # noqa: F811
    h = admin_headers(client)
    base = {"mode": "anonymiser", "mot_de_passe": "motdepasse123", "confirmation": "oui"}
    assert client.post(URL, headers=h, json=base).status_code == 422
    assert client.post(URL, headers=h, json={**base, "confirmation": "EFFACER", "mot_de_passe": "faux"}).status_code == 403
    assert len(client.get("/api/admin/volontaires", headers=h).json()) == 0  # rien n'a bougé (base vide ici)


def test_reserve_au_responsable(client):  # noqa: F811
    h = admin_headers(client)
    _, hr = creer_relais(client, h)
    r = client.post(URL, headers=hr, json={"mode": "effacer", "mot_de_passe": "relais12345", "confirmation": "EFFACER"})
    assert r.status_code == 403


def test_anonymiser_garde_les_chiffres(client):  # noqa: F811
    h = admin_headers(client)
    v1, _ = _preparer(client, h)
    apercu = client.get(f"{URL}/apercu", headers=h).json()
    assert apercu["volontaires"] == 2 and apercu["comptes_equipe"] == 1

    r = client.post(URL, headers=h, json={"mode": "anonymiser", "mot_de_passe": "motdepasse123", "confirmation": "effacer"})
    assert r.status_code == 200, r.text
    vols = client.get("/api/admin/volontaires", headers=h).json()
    assert len(vols) == 2
    assert all(v["nom"].startswith("Volontaire n°") and v["telephone"].startswith("anonyme-") for v in vols)
    assert all(not v["remarques"] and v["recrute_par_id"] is None for v in vols)
    # l'ancien lien personnel ne fonctionne plus
    assert client.get(f"/api/public/moi/{v1['token']}").status_code == 404
    # les chiffres restent : couverture et présents
    cov = {j["jour"]: j for j in client.get("/api/admin/couverture", headers=h).json()["jours"]}
    assert cov["2026-11-23"]["total"] == 2 and cov["2026-11-23"]["constate"]["adultes"] == 12
    assert cov["2026-11-23"]["constate"]["note"] == ""
    # journal vidé (sauf la trace de l'opération), comptes supprimés, inscriptions fermées
    journal = client.get("/api/admin/journal", headers=h).json()
    lignes = journal if isinstance(journal, list) else journal.get("lignes", [])
    assert [l["action"] for l in lignes] == ["fin_de_projet"]
    assert len(client.get("/api/admin/utilisateurs", headers=h).json()) == 1
    assert client.get("/api/public/config").json()["inscriptions_ouvertes"] is False


def test_tout_effacer(client):  # noqa: F811
    h = admin_headers(client)
    _preparer(client, h)
    r = client.post(URL, headers=h, json={
        "mode": "effacer", "mot_de_passe": "motdepasse123", "confirmation": "EFFACER", "supprimer_comptes": False})
    assert r.status_code == 200, r.text
    assert client.get("/api/admin/volontaires", headers=h).json() == []
    cov = {j["jour"]: j for j in client.get("/api/admin/couverture", headers=h).json()["jours"]}
    assert cov["2026-11-23"]["total"] == 0 and cov["2026-11-23"]["constate"] is None
    assert len(client.get("/api/admin/utilisateurs", headers=h).json()) == 2  # comptes conservés
