"""Messages WhatsApp : destinataires par cible, droits, lien de communauté, journal."""
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)
from tests.test_relais import creer_relais

URL = "/api/admin/messages/destinataires"


def _inscrire(c, h, n, jours, assemblee="Assemblée B"):
    corps = payload(tel=f"6900000{n:02d}", jours=jours, nom=f"Volontaire {n}")
    corps["assemblee"] = assemblee
    r = c.post("/api/admin/volontaires", headers=h, json=corps)
    assert r.status_code == 201, r.text
    return r.json()


def test_cibles(client):  # noqa: F811
    h = admin_headers(client)
    p = client.get("/api/admin/parametres", headers=h).json()
    p.update(plafond_jour=2, seuil_alerte=2)
    assert client.put("/api/admin/parametres", headers=h, json=p).status_code == 200
    for n in range(3):
        _inscrire(client, h, n, ["2026-11-28"])
    _inscrire(client, h, 9, ["2026-11-30"], assemblee="Assemblée A")

    tous = client.get(URL, headers=h, params={"cible": "tous"}).json()
    assert len(tous) == 4 and {"telephone", "token", "nom"} <= set(tous[0])

    attendus = client.get(URL, headers=h, params={"cible": "jour", "jour": "2026-11-28"}).json()
    assert len(attendus) == 2 and all(d["jour"] == "2026-11-28" and d["creneau"] for d in attendus)
    reserve = client.get(URL, headers=h, params={"cible": "jour", "jour": "2026-11-28", "reserve": "reserve"}).json()
    assert [d["nom"] for d in reserve] == ["Volontaire 2"] and reserve[0]["en_reserve"]
    assert len(client.get(URL, headers=h, params={"cible": "jour", "jour": "2026-11-28", "reserve": "tous"}).json()) == 3

    kl = client.get(URL, headers=h, params={"cible": "assemblee", "assemblee": "Assemblée A"}).json()
    assert [d["nom"] for d in kl] == ["Volontaire 9"]

    assert client.get(URL, headers=h, params={"cible": "jour"}).status_code == 422
    assert client.get(URL, headers=h, params={"cible": "jour", "jour": "2026-11-29"}).status_code == 422  # dimanche


def test_homme_cle_ecrit_seulement_a_ses_recrues(client):  # noqa: F811
    h = admin_headers(client)
    _, hr = creer_relais(client, h)
    _inscrire(client, hr, 1, ["2026-11-28"])  # saisi par l'homme clé : c'est sa recrue
    _inscrire(client, h, 2, ["2026-11-28"])
    assert client.get(URL, headers=hr, params={"cible": "tous"}).status_code == 403
    assert client.get(URL, headers=hr, params={"cible": "jour", "jour": "2026-11-28"}).status_code == 403
    recrues = client.get(URL, headers=hr, params={"cible": "recrues"}).json()
    assert [d["nom"] for d in recrues] == ["Volontaire 1"]


def test_cuisine_n_a_pas_acces(client):  # noqa: F811
    h = admin_headers(client)
    client.post("/api/admin/utilisateurs", headers=h, json={
        "nom": "Cuisine", "email": "cuisine@test.cm", "role": "cuisine", "password": "cuisine12345"})
    t = client.post("/api/auth/login", json={"email": "cuisine@test.cm", "password": "cuisine12345"}).json()["token"]
    assert client.get(URL, headers={"Authorization": f"Bearer {t}"}, params={"cible": "tous"}).status_code == 403


def test_lien_communaute_et_journal(client):  # noqa: F811
    h = admin_headers(client)
    p = client.get("/api/admin/parametres", headers=h).json()
    p["lien_communaute"] = "https://example.com/pas-whatsapp"
    assert client.put("/api/admin/parametres", headers=h, json=p).status_code == 422
    p["lien_communaute"] = "https://chat.whatsapp.com/AbCdEf123"
    assert client.put("/api/admin/parametres", headers=h, json=p).status_code == 200
    assert client.get("/api/public/config").json()["lien_communaute"] == "https://chat.whatsapp.com/AbCdEf123"

    r = client.post("/api/admin/messages/journal", headers=h, json={
        "cible": "Samedi 28 nov. (attendus)", "mode": "individuel", "nombre": 12, "apercu": "Bonjour, rappel…"})
    assert r.status_code == 204
    journal = client.get("/api/admin/journal", headers=h).json()
    lignes = journal if isinstance(journal, list) else journal.get("lignes", journal.get("items", []))
    assert any(l["action"] == "message" for l in lignes)
