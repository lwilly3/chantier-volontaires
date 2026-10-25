"""Les mineurs ne s'inscrivent pas ; un adulte peut annoncer des mineurs à sa charge."""
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)


def test_majorite_obligatoire(client):  # noqa: F811
    r = client.post("/api/public/inscription", json={**payload(), "majeur_confirme": False})
    assert r.status_code == 422 and "majeures" in r.json()["detail"]
    sans = payload()
    sans.pop("majeur_confirme")
    assert client.post("/api/public/inscription", json=sans).status_code == 422
    # le formulaire public ne peut plus enregistrer un volontaire mineur
    r = client.post("/api/public/inscription", json={**payload(), "est_mineur": True})
    assert r.status_code == 201 and r.json()["est_mineur"] is False


def test_mineurs_accompagnes(client):  # noqa: F811
    h = admin_headers(client)
    r = client.post("/api/public/inscription", json={**payload(tel="677100001", jours=["2026-11-23"]), "nb_mineurs": 2})
    assert r.status_code == 201 and r.json()["nb_mineurs"] == 2
    client.post("/api/public/inscription", json=payload(tel="677100002", jours=["2026-11-23"]))
    token = r.json()["token"]

    jour = next(j for j in client.get("/api/admin/couverture", headers=h).json()["jours"] if j["jour"] == "2026-11-23")
    assert jour["total"] == 2 and jour["mineurs"] == 2
    liste = client.get("/api/admin/jours/2026-11-23", headers=h).json()["volontaires"]
    assert sorted(v["nb_mineurs"] for v in liste) == [0, 2]

    # modification par le lien personnel
    r = client.put(f"/api/public/moi/{token}", json={**payload(tel="677100001", jours=["2026-11-23"]), "nb_mineurs": 1})
    assert r.json()["nb_mineurs"] == 1
    assert client.post("/api/public/inscription", json={**payload(tel="677100003"), "nb_mineurs": 11}).status_code == 422

    csv = client.get("/api/admin/export/volontaires.csv", headers=h).text
    assert "Mineurs accompagnés" in csv


def test_mineurs_de_la_reserve_non_comptes(client):  # noqa: F811
    h = admin_headers(client)
    params = client.get("/api/admin/parametres", headers=h).json()
    client.put("/api/admin/parametres", headers=h, json={**params, "plafond_jour": 1, "seuil_alerte": 1})
    client.post("/api/public/inscription", json={**payload(tel="677200001", jours=["2026-11-23"]), "nb_mineurs": 1})
    client.post("/api/public/inscription", json={**payload(tel="677200002", jours=["2026-11-23"]), "nb_mineurs": 3})
    jour = next(j for j in client.get("/api/admin/couverture", headers=h).json()["jours"] if j["jour"] == "2026-11-23")
    assert jour["reserve"] == 1 and jour["mineurs"] == 1
