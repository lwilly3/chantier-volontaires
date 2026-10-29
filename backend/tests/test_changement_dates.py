"""Changement des dates du chantier : chiffres, export, impact annoncé, volontaires à prévenir."""
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)


def _dates(c, h, debut, fin):
    p = c.get("/api/admin/parametres", headers=h).json()
    p.update(date_debut=debut, date_fin=fin)
    assert c.put("/api/admin/parametres", headers=h, json=p).status_code == 200
    return p


def _preparer(c, h):
    _dates(c, h, "2026-11-02", "2027-01-23")
    c.post("/api/admin/volontaires", headers=h, json=payload(tel="690000001", nom="Seulement novembre", jours=["2026-11-14", "2026-11-28"]))
    c.post("/api/admin/volontaires", headers=h, json=payload(tel="690000002", nom="Novembre et décembre", jours=["2026-11-28", "2026-12-05"]))
    c.post("/api/admin/volontaires", headers=h, json=payload(tel="690000003", nom="Décembre", jours=["2026-12-05"]))


def test_impact_annonce_avant_enregistrement(client):  # noqa: F811
    h = admin_headers(client)
    _preparer(client, h)
    p = client.get("/api/admin/parametres", headers=h).json()
    p.update(date_debut="2026-12-01")
    imp = client.post("/api/admin/parametres/impact", headers=h, json=p).json()
    assert imp["volontaires_concernes"] == 2      # les deux qui avaient des jours en novembre
    assert imp["devenus_sans_jour"] == 1          # « Seulement novembre » n'aura plus aucun jour
    assert imp["inscriptions_retirees"] == 3      # 14/11, 28/11, 28/11
    assert imp["jours_retires"] > 0 and imp["jours_ajoutes"] == 0
    # rien n'est modifié par l'aperçu
    assert client.get("/api/admin/parametres", headers=h).json()["date_debut"] == "2026-11-02"


def test_chiffres_export_et_messages_apres_changement(client):  # noqa: F811
    h = admin_headers(client)
    _preparer(client, h)
    _dates(client, h, "2026-12-01", "2027-02-05")

    resume = client.get("/api/admin/couverture", headers=h).json()["resume"]
    assert resume["sans_disponibilite"] == 1 and resume["hors_dates"] == 2

    csv = client.get("/api/admin/export/volontaires.csv", headers=h).text
    assert "14/11" not in csv and "28/11" not in csv and "05/12" in csv

    a_prevenir = client.get("/api/admin/messages/destinataires", headers=h, params={"cible": "hors_dates"}).json()
    assert sorted(d["nom"] for d in a_prevenir) == ["Novembre et décembre", "Seulement novembre"]
