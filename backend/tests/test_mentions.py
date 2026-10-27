"""Mentions légales et consentement à l'inscription."""
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)


def test_consentement_obligatoire(client):  # noqa: F811
    r = client.post("/api/public/inscription", json={**payload(), "consentement": False})
    assert r.status_code == 422 and "mentions légales" in r.json()["detail"]
    sans = payload()
    sans.pop("consentement")
    assert client.post("/api/public/inscription", json=sans).status_code == 422
    assert client.post("/api/public/inscription", json=payload()).status_code == 201


def test_mentions_lisibles_sans_code(client):  # noqa: F811
    h = admin_headers(client)
    client.put("/api/admin/acces-formulaire", headers=h, json={"code_acces_actif": True, "code_acces": "CHANTIER26"})
    p = client.get("/api/admin/parametres", headers=h).json()
    p.update(responsable_donnees="Frère Martin", contact_whatsapp="+237 6 00 00 00 00")
    assert client.put("/api/admin/parametres", headers=h, json=p).status_code == 200
    m = client.get("/api/public/mentions").json()
    assert m["responsable_donnees"] == "Frère Martin" and m["contact"] == "+237 6 00 00 00 00"
    assert client.get("/api/public/config").json()["acces"] is False  # le formulaire reste protégé
