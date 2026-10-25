"""Code d'accès au formulaire d'inscription."""
from app import ratelimit
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)
from tests.test_relais import creer_relais


def activer_code(c, h, code="Kambo 2026", actif=True):
    return c.put("/api/admin/acces-formulaire", headers=h, json={"code_acces_actif": actif, "code_acces": code})


def test_sans_code_tout_est_ouvert(client):  # noqa: F811
    cfg = client.get("/api/public/config").json()
    assert cfg["code_requis"] is False and cfg["acces"] is True and cfg["jours"]
    assert client.post("/api/public/inscription", json=payload()).status_code == 201


def test_code_exige(client):  # noqa: F811
    h = admin_headers(client)
    assert activer_code(client, h).status_code == 200

    # sans code : rien d'autre que le nom du chantier
    cfg = client.get("/api/public/config").json()
    assert cfg == {"nom_chantier": cfg["nom_chantier"], "code_requis": True, "acces": False}
    assert client.post("/api/public/inscription", json=payload()).status_code == 403
    assert client.post("/api/public/inscription", json={**payload(), "code_acces": "faux"}).status_code == 403
    assert client.post("/api/public/acces", json={"code": "faux"}).status_code == 403

    # le code est insensible à la casse et aux espaces
    assert client.post("/api/public/acces", json={"code": " kambo2026 "}).status_code == 204
    cfg = client.get("/api/public/config", params={"code": "KAMBO 2026"}).json()
    assert cfg["acces"] is True and cfg["jours"]
    r = client.post("/api/public/inscription", json={**payload(), "code_acces": "kambo2026"})
    assert r.status_code == 201
    token = r.json()["token"]

    # le lien personnel d'un volontaire fonctionne sans code
    assert client.get("/api/public/config", params={"jeton": token}).json()["acces"] is True
    assert client.get(f"/api/public/moi/{token}").status_code == 200
    assert client.get("/api/public/config", params={"jeton": "faux"}).json()["acces"] is False

    # l'équipe connectée voit tout
    assert client.get("/api/public/config", headers=h).json()["acces"] is True

    # changer le code : l'ancien ne marche plus
    activer_code(client, h, code="NOUVEAU1")
    assert client.post("/api/public/acces", json={"code": "kambo2026"}).status_code == 403
    assert client.post("/api/public/acces", json={"code": "nouveau1"}).status_code == 204

    # désactiver : tout redevient ouvert
    activer_code(client, h, code="NOUVEAU1", actif=False)
    assert client.get("/api/public/config").json()["acces"] is True


def test_lien_de_recrutement_exige_aussi_le_code(client):  # noqa: F811
    h = admin_headers(client)
    _, hr = creer_relais(client, h)
    code_r = client.get("/api/admin/mon-recrutement", headers=hr).json()["code"]
    activer_code(client, h)
    assert client.get("/api/public/config", params={"r": code_r}).json()["acces"] is False
    assert client.post("/api/public/inscription", json={**payload(), "recrutement": code_r}).status_code == 403
    r = client.post("/api/public/inscription", json={**payload(), "recrutement": code_r, "code_acces": "KAMBO2026"})
    assert r.status_code == 201
    mes = client.get("/api/admin/volontaires?recrute_par=moi", headers=hr).json()
    assert len(mes) == 1  # toujours rattaché au recruteur


def test_code_trop_court_refuse(client):  # noqa: F811
    h = admin_headers(client)
    assert activer_code(client, h, code="ab").status_code == 422


def test_reglages_chantier_ne_touchent_pas_au_code(client):  # noqa: F811
    h = admin_headers(client)
    activer_code(client, h)
    params = client.get("/api/admin/parametres", headers=h).json()
    assert params["code_acces"] == "Kambo 2026"
    client.put("/api/admin/parametres", headers=h, json={**params, "code_acces_actif": False, "code_acces": "", "plafond_jour": 40, "seuil_alerte": 35})
    params = client.get("/api/admin/parametres", headers=h).json()
    assert params["plafond_jour"] == 40 and params["code_acces_actif"] is True and params["code_acces"] == "Kambo 2026"
    _, hr = creer_relais(client, h)
    assert client.put("/api/admin/acces-formulaire", headers=hr, json={"code_acces_actif": False}).status_code == 403


def test_essais_limites(client):  # noqa: F811
    h = admin_headers(client)
    activer_code(client, h)
    ratelimit.reset()
    codes = [client.post("/api/public/acces", json={"code": f"essai{i}"}).status_code for i in range(12)]
    assert codes[:10] == [403] * 10 and codes[10:] == [429, 429]
