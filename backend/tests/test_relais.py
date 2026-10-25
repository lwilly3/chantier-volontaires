"""Rôle « Homme clé » (relais) et liens de recrutement."""
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)


def creer_relais(c, h, nom="Paul Relais", email="relais@test.cm"):
    r = c.post("/api/admin/utilisateurs", headers=h, json={
        "nom": nom, "email": email, "role": "relais", "password": "relais12345"})
    assert r.status_code == 201, r.text
    t = c.post("/api/auth/login", json={"email": email, "password": "relais12345"}).json()["token"]
    return r.json()["id"], {"Authorization": f"Bearer {t}"}


def test_droits_du_relais(client):  # noqa: F811
    h = admin_headers(client)
    _, hr = creer_relais(client, h)

    # autorisé : couverture, liste, création, modification, désactivation, liste du jour, nouveau lien
    assert client.get("/api/admin/couverture", headers=hr).status_code == 200
    r = client.post("/api/admin/volontaires", headers=hr, json=payload(tel="690000001"))
    assert r.status_code == 201
    vid = r.json()["id"]
    assert client.get("/api/admin/volontaires", headers=hr).status_code == 200
    assert client.get("/api/admin/jours/2026-11-23", headers=hr).json()["volontaires"][0]["telephone"] == "+237690000001"
    r = client.put(f"/api/admin/volontaires/{vid}", headers=hr, json={**payload(tel="690000001"), "actif": False})
    assert r.status_code == 200 and r.json()["actif"] is False
    assert client.post(f"/api/admin/volontaires/{vid}/nouveau-lien", headers=hr).status_code == 200

    # interdit : suppression, export, journal, réglages, comptes, e-mails
    assert client.delete(f"/api/admin/volontaires/{vid}", headers=hr).status_code == 403
    assert client.get("/api/admin/export/volontaires.csv", headers=hr).status_code == 403
    assert client.get("/api/admin/journal", headers=hr).status_code == 403
    params = client.get("/api/admin/parametres", headers=hr)
    assert params.status_code == 200
    assert client.put("/api/admin/parametres", headers=hr, json=params.json()).status_code == 403
    assert client.get("/api/admin/utilisateurs", headers=hr).status_code == 403
    assert client.get("/api/admin/email", headers=hr).status_code == 403

    # la cuisine ne gère toujours pas les volontaires
    client.post("/api/admin/utilisateurs", headers=h, json={
        "nom": "Cuisine", "email": "cuisine@test.cm", "role": "cuisine", "password": "cuisine12345"})
    tc = client.post("/api/auth/login", json={"email": "cuisine@test.cm", "password": "cuisine12345"}).json()["token"]
    assert client.post("/api/admin/volontaires", headers={"Authorization": f"Bearer {tc}"},
                       json=payload(tel="690000009")).status_code == 403
    assert client.get("/api/admin/mon-recrutement", headers={"Authorization": f"Bearer {tc}"}).status_code == 403


def test_lien_de_recrutement(client):  # noqa: F811
    h = admin_headers(client)
    rid, hr = creer_relais(client, h)

    lien = client.get("/api/admin/mon-recrutement", headers=hr).json()
    assert lien["nb_recrues"] == 0 and lien["lien"].endswith(f"/?r={lien['code']}")
    # le code est stable
    assert client.get("/api/admin/mon-recrutement", headers=hr).json()["code"] == lien["code"]

    assert client.get(f"/api/public/recruteur/{lien['code']}").json() == {"prenom": "Paul"}
    assert client.get("/api/public/recruteur/inconnu").status_code == 404

    # inscription publique via le lien
    r = client.post("/api/public/inscription", json={**payload(tel="691000001"), "recrutement": lien["code"]})
    assert r.status_code == 201
    # code invalide : inscription acceptée, sans recruteur
    assert client.post("/api/public/inscription", json={**payload(tel="691000002"), "recrutement": "faux"}).status_code == 201
    # saisie directe par le relais : comptée aussi
    client.post("/api/admin/volontaires", headers=hr, json=payload(tel="691000003"))
    # saisie par le responsable : pas de recruteur
    client.post("/api/admin/volontaires", headers=h, json=payload(tel="691000004"))

    mes = client.get("/api/admin/volontaires?recrute_par=moi", headers=hr).json()
    assert {v["telephone"] for v in mes} == {"+237691000001", "+237691000003"}
    assert all(v["recrute_par"] == "Paul Relais" for v in mes)
    assert client.get("/api/admin/mon-recrutement", headers=hr).json()["nb_recrues"] == 2

    comptes = {u["nom"]: u for u in client.get("/api/admin/utilisateurs", headers=h).json()}
    assert comptes["Paul Relais"]["nb_recrues"] == 2 and comptes["Paul Relais"]["role"] == "relais"
    par_id = client.get(f"/api/admin/volontaires?recrute_par={rid}", headers=h).json()
    assert len(par_id) == 2

    # un compte désactivé ne recrute plus
    client.put(f"/api/admin/utilisateurs/{rid}", headers=h, json={
        "nom": "Paul Relais", "email": "relais@test.cm", "role": "relais", "actif": False})
    assert client.get(f"/api/public/recruteur/{lien['code']}").status_code == 404


def test_invitation_homme_cle(client):  # noqa: F811
    h = admin_headers(client)
    r = client.post("/api/admin/utilisateurs/inviter", headers=h, json={"nom": "Samuel Tchoua", "role": "relais"})
    assert r.status_code == 201 and r.json()["utilisateur"]["role"] == "relais"
