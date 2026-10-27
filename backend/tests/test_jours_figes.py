"""Réglage « figer les jours passés » : les volontaires ne modifient plus les jours antérieurs à aujourd'hui."""
from datetime import date

import pytest

from app import services
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)


@pytest.fixture()
def le_2_decembre(monkeypatch):
    monkeypatch.setattr(services, "aujourd_hui", lambda: date(2026, 12, 2))


def _parametres(c, h, **champs):
    p = c.get("/api/admin/parametres", headers=h).json()
    p.update(champs)
    r = c.put("/api/admin/parametres", headers=h, json=p)
    assert r.status_code == 200, r.text
    return r.json()


def test_reglage_actif_par_defaut_et_expose(client, le_2_decembre):  # noqa: F811
    h = admin_headers(client)
    assert client.get("/api/admin/parametres", headers=h).json()["figer_jours_passes"] is True
    assert client.get("/api/public/config").json()["jours_figes_avant"] == "2026-12-02"
    _parametres(client, h, figer_jours_passes=False)
    assert client.get("/api/public/config").json()["jours_figes_avant"] is None


def test_volontaire_ne_modifie_pas_les_jours_passes(client, le_2_decembre):  # noqa: F811
    h = admin_headers(client)
    # Inscrit (par l'équipe, non figée) sur un jour passé et un jour à venir
    v = client.post("/api/admin/volontaires", headers=h, json=payload(jours=["2026-11-24", "2026-12-05"])).json()
    tok = v["token"]
    moi = client.get(f"/api/public/moi/{tok}").json()

    # Il tente de retirer le jour passé, d'en ajouter un autre passé et de changer le jour à venir
    moi["disponibilites"] = [
        {"jour": "2026-11-25", "creneau": "journee"},
        {"jour": "2026-12-05", "creneau": "matin"},
    ]
    r = client.put(f"/api/public/moi/{tok}", json=moi)
    assert r.status_code == 200, r.text
    jours = {d["jour"]: d["creneau"] for d in r.json()["disponibilites"]}
    assert jours == {"2026-11-24": "journee", "2026-12-05": "matin"}

    # Réglage désactivé : tout redevient modifiable
    _parametres(client, h, figer_jours_passes=False)
    r = client.put(f"/api/public/moi/{tok}", json=moi)
    jours = {d["jour"] for d in r.json()["disponibilites"]}
    assert jours == {"2026-11-25", "2026-12-05"}


def test_equipe_peut_toujours_corriger(client, le_2_decembre):  # noqa: F811
    h = admin_headers(client)
    v = client.post("/api/admin/volontaires", headers=h, json=payload(jours=["2026-11-24"])).json()
    corps = client.get(f"/api/admin/volontaires/{v['id']}", headers=h).json()
    corps["disponibilites"] = [{"jour": "2026-11-26", "creneau": "apres_midi"}]
    r = client.put(f"/api/admin/volontaires/{v['id']}", headers=h, json=corps)
    assert r.status_code == 200, r.text
    assert [d["jour"] for d in r.json()["disponibilites"]] == ["2026-11-26"]


def test_inscription_ignore_les_jours_passes(client, le_2_decembre):  # noqa: F811
    r = client.post("/api/public/inscription", json=payload(jours=["2026-11-24", "2026-12-05"]))
    assert r.status_code == 201, r.text
    assert [d["jour"] for d in r.json()["disponibilites"]] == ["2026-12-05"]
