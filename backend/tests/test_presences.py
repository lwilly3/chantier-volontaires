"""Présents constatés, lien dédié protégé par mot de passe, analyses et option mineurs/plafond."""
from datetime import date

import pytest

from app.routers import admin as admin_router
from app.routers import presences as pres_router
from tests.test_api import admin_headers, client, payload  # noqa: F401  (fixture)
from tests.test_relais import creer_relais

AUJOURDHUI = date(2026, 12, 2)  # un mercredi en plein chantier


@pytest.fixture(autouse=True)
def date_fixe(monkeypatch):
    monkeypatch.setattr(pres_router, "aujourd_hui", lambda: AUJOURDHUI)
    monkeypatch.setattr(admin_router, "aujourd_hui", lambda: AUJOURDHUI)


def inscrire(c, n, jours, prefixe="6771", mineurs=0):
    for i in range(n):
        r = c.post("/api/public/inscription",
                   json={**payload(tel=f"{prefixe}{i:05d}", nom=f"Frère {prefixe}{i}", jours=jours), "nb_mineurs": mineurs})
        assert r.status_code == 201, r.text


def test_saisie_par_l_equipe_et_analyses(client):  # noqa: F811
    h = admin_headers(client)
    # deux lundis et deux mercredis passés + jours futurs
    inscrire(client, 10, ["2026-11-23", "2026-11-25", "2026-11-30", "2026-12-02", "2026-12-07", "2026-12-09"])
    for jour, n in [("2026-11-23", 6), ("2026-11-30", 7), ("2026-11-25", 9), ("2026-12-02", 9)]:
        r = client.put(f"/api/admin/presences/{jour}", headers=h, json={"adultes": n, "note": "test"})
        assert r.status_code == 200 and r.json()["saisi_par"] == "Responsable volontaires"
    # jour futur refusé, jour hors chantier refusé
    assert client.put("/api/admin/presences/2026-12-03", headers=h, json={"adultes": 5}).status_code == 422
    assert client.put("/api/admin/presences/2026-11-29", headers=h, json={"adultes": 5}).status_code == 422

    a = client.get("/api/admin/analyses", headers=h).json()
    assert a["nb_jours_saisis"] == 4 and a["taux_global"] == 0.775  # 31 / 40
    lundi, mercredi = a["par_jour_semaine"][0], a["par_jour_semaine"][2]
    assert lundi["taux"] == 0.65 and mercredi["taux"] == 0.9
    prochains = {x["jour"]: x for x in a["prochains"]}
    assert prochains["2026-12-07"]["probables"] == 6   # lundi : 10 × 0,65
    assert prochains["2026-12-09"]["probables"] == 9   # mercredi : 10 × 0,9
    assert "2026-12-02" not in prochains               # déjà saisi

    cov = {j["jour"]: j for j in client.get("/api/admin/couverture", headers=h).json()["jours"]}
    assert cov["2026-11-23"]["constate"]["adultes"] == 6 and cov["2026-12-07"]["probables"] == 6

    # correction puis effacement
    client.put("/api/admin/presences/2026-11-23", headers=h, json={"adultes": 8})
    assert client.get("/api/admin/analyses", headers=h).json()["jours"][0]["presents"] == 8
    assert client.delete("/api/admin/presences/2026-11-23", headers=h).status_code == 204
    assert client.get("/api/admin/analyses", headers=h).json()["nb_jours_saisis"] == 3


def test_droits_de_saisie(client):  # noqa: F811
    h = admin_headers(client)
    _, hr = creer_relais(client, h)
    assert client.put("/api/admin/presences/2026-11-23", headers=hr, json={"adultes": 3}).status_code == 403
    assert client.get("/api/admin/analyses", headers=hr).status_code == 200


def test_lien_dedie(client):  # noqa: F811
    h = admin_headers(client)
    inscrire(client, 4, ["2026-11-30", "2026-12-02", "2026-12-04"])
    assert client.get("/api/presences/etat").json()["actif"] is False
    assert client.post("/api/presences/connexion", json={"mot_de_passe": "x", "nom": "Paul"}).status_code == 403

    # activation sans mot de passe refusée, mot de passe trop court refusé
    assert client.put("/api/admin/presences-acces", headers=h, json={"actif": True}).status_code == 422
    assert client.put("/api/admin/presences-acces", headers=h, json={"actif": True, "mot_de_passe": "abc"}).status_code == 422
    r = client.put("/api/admin/presences-acces", headers=h, json={"actif": True, "mot_de_passe": "chantier26"})
    assert r.status_code == 200 and r.json()["presences_actif"] and r.json()["presences_mdp_defini"]

    assert client.post("/api/presences/connexion", json={"mot_de_passe": "faux", "nom": "Paul"}).status_code == 401
    t = client.post("/api/presences/connexion", json={"mot_de_passe": "chantier26", "nom": " Paul  Ngono "}).json()
    assert t["nom"] == "Paul Ngono"
    hp = {"Authorization": f"Bearer {t['token']}"}

    j = client.get("/api/presences/jours", headers=hp).json()
    assert [x["jour"] for x in j["jours"]][:2] == ["2026-12-02", "2026-12-01"]  # aujourd'hui d'abord, rien de futur
    assert j["jours"][0]["prevus"] == 4 and "nom" not in j["jours"][0]

    r = client.put("/api/presences/2026-12-02", headers=hp, json={"adultes": 3, "mineurs": 1, "note": "pluie"})
    assert r.status_code == 200 and r.json()["saisi_par"] == "Paul Ngono (lien présences)"
    assert client.put("/api/presences/2026-12-04", headers=hp, json={"adultes": 3}).status_code == 422

    # le jeton du lien ne donne aucun accès à l'espace équipe
    assert client.get("/api/admin/couverture", headers=hp).status_code == 401
    assert client.get("/api/admin/volontaires", headers=hp).status_code == 401

    # changer le mot de passe déconnecte ; désactiver coupe l'accès
    client.put("/api/admin/presences-acces", headers=h, json={"actif": True, "mot_de_passe": "nouveau2026"})
    assert client.get("/api/presences/jours", headers=hp).status_code == 401
    t2 = client.post("/api/presences/connexion", json={"mot_de_passe": "nouveau2026", "nom": "Paul"}).json()["token"]
    client.put("/api/admin/presences-acces", headers=h, json={"actif": False})
    assert client.get("/api/presences/jours", headers={"Authorization": f"Bearer {t2}"}).status_code == 403


def test_mineurs_dans_le_plafond(client):  # noqa: F811
    h = admin_headers(client)
    params = client.get("/api/admin/parametres", headers=h).json()
    client.put("/api/admin/parametres", headers=h, json={**params, "plafond_jour": 4, "seuil_alerte": 3})
    inscrire(client, 1, ["2026-11-23"], prefixe="6781", mineurs=2)  # occupe 3 places si les mineurs comptent
    inscrire(client, 2, ["2026-11-23"], prefixe="6782")

    jour = lambda: next(j for j in client.get("/api/admin/couverture", headers=h).json()["jours"] if j["jour"] == "2026-11-23")  # noqa: E731
    assert jour()["reserve"] == 0 and jour()["statut"] == "presque"  # 3 adultes / 4

    params = client.get("/api/admin/parametres", headers=h).json()
    client.put("/api/admin/parametres", headers=h, json={**params, "compter_mineurs_plafond": True})
    j = jour()
    assert j["presents"] == 2 and j["reserve"] == 1 and j["occupation"] == 4 and j["statut"] == "complet"
    liste = client.get("/api/admin/jours/2026-11-23", headers=h).json()["volontaires"]
    assert [v["en_reserve"] for v in liste] == [False, False, True]
