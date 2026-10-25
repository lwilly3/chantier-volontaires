"""Invitations, réinitialisations, configuration et envoi d'e-mails (SMTP simulé)."""
import re
import smtplib
from datetime import timedelta

import pytest

from app import mailer
from app.db import SessionLocal
from app.models import ConfigEmail, Jeton
from tests.test_api import admin_headers, client  # noqa: F401  (fixture)

ENVOYES: list = []


class FauxSMTP:
    refuser_login = False

    def __init__(self, hote, port, timeout=None, context=None):
        self.hote, self.port = hote, port

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self, context=None):
        pass

    def login(self, user, password):
        if FauxSMTP.refuser_login or password != "cle-smtp":
            raise smtplib.SMTPAuthenticationError(535, b"refus")

    def send_message(self, msg):
        ENVOYES.append(msg)


@pytest.fixture(autouse=True)
def smtp(monkeypatch):
    ENVOYES.clear()
    FauxSMTP.refuser_login = False
    monkeypatch.setattr(mailer.smtplib, "SMTP", FauxSMTP)
    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", FauxSMTP)


def configurer_email(c, h, actif=True):
    return c.put("/api/admin/email", headers=h, json={
        "actif": actif, "fournisseur": "brevo", "hote": "smtp-relay.brevo.com", "port": 587,
        "securite": "starttls", "utilisateur": "compte@brevo", "mot_de_passe": "cle-smtp",
        "expediteur_email": "volontaires@sallekambo.org", "expediteur_nom": "Service volontaires",
    })


def token_de(lien: str) -> str:
    return lien.rsplit("/", 1)[-1]


def corps(msg) -> str:
    return msg.get_body(preferencelist=("plain",)).get_content()


def test_invitation_sans_email_par_lien(client):  # noqa: F811
    h = admin_headers(client)
    r = client.post("/api/admin/utilisateurs/inviter", headers=h,
                    json={"nom": "Paul Ngono", "role": "adjoint", "email": "", "envoyer_email": True})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["utilisateur"]["statut"] == "invite" and data["email_envoye"] is False
    assert "/admin/invitation/" in data["lien"]
    token = token_de(data["lien"])

    info = client.get(f"/api/auth/jeton/{token}").json()
    assert info == {"type": "invitation", "nom": "Paul Ngono", "email": None, "role": "adjoint"}

    # e-mail obligatoire si inconnu
    assert client.post(f"/api/auth/jeton/{token}", json={"password": "motdepasse99"}).status_code == 422
    # e-mail déjà pris
    assert client.post(f"/api/auth/jeton/{token}", json={"password": "motdepasse99", "email": "chef@test.cm"}).status_code == 409

    r = client.post(f"/api/auth/jeton/{token}", json={"password": "motdepasse99", "email": "Paul@Test.cm"})
    assert r.status_code == 200 and r.json()["utilisateur"]["statut"] == "actif"
    # lien à usage unique
    assert client.get(f"/api/auth/jeton/{token}").status_code == 404
    assert client.post("/api/auth/login", json={"email": "paul@test.cm", "password": "motdepasse99"}).status_code == 200


def test_invitation_par_email_et_renvoi(client):  # noqa: F811
    h = admin_headers(client)
    # e-mail non configuré : le lien est quand même créé, avec un avertissement
    r = client.post("/api/admin/utilisateurs/inviter", headers=h,
                    json={"nom": "Marie Ekane", "role": "cuisine", "email": "marie@test.cm"})
    assert r.json()["email_envoye"] is False and "pas activé" in r.json()["erreur_email"]
    premier = token_de(r.json()["lien"])
    uid = r.json()["utilisateur"]["id"]

    assert configurer_email(client, h).status_code == 200
    r = client.post(f"/api/admin/utilisateurs/{uid}/invitation", headers=h)
    assert r.json()["email_envoye"] is True, r.json()
    msg = ENVOYES[-1]
    assert msg["To"] == "marie@test.cm" and "Invitation" in msg["Subject"]
    nouveau = token_de(r.json()["lien"])
    assert nouveau in corps(msg) and "Cuisine" in corps(msg)
    # le renvoi annule l'ancien lien
    assert client.get(f"/api/auth/jeton/{premier}").status_code == 404
    assert client.get(f"/api/auth/jeton/{nouveau}").status_code == 200


def test_invitation_expiree(client):  # noqa: F811
    h = admin_headers(client)
    r = client.post("/api/admin/utilisateurs/inviter", headers=h, json={"nom": "Joël Tamba", "role": "comite"})
    token = token_de(r.json()["lien"])
    with SessionLocal() as db:
        j = db.query(Jeton).one()
        j.expire_at = j.expire_at - timedelta(days=4)
        db.commit()
    assert client.get(f"/api/auth/jeton/{token}").status_code == 404
    comptes = {u["nom"]: u for u in client.get("/api/admin/utilisateurs", headers=h).json()}
    assert comptes["Joël Tamba"]["invitation_expiree"] is True
    # annulation d'une invitation
    assert client.delete(f"/api/admin/utilisateurs/{comptes['Joël Tamba']['id']}", headers=h).status_code == 204


def test_reinitialisation_par_responsable_deconnecte_les_sessions(client):  # noqa: F811
    h = admin_headers(client)
    r = client.post("/api/admin/utilisateurs", headers=h, json={
        "nom": "Esther", "email": "esther@test.cm", "role": "adjoint", "password": "ancienmdp1"})
    uid = r.json()["id"]
    ancienne_session = client.post("/api/auth/login", json={"email": "esther@test.cm", "password": "ancienmdp1"}).json()["token"]

    r = client.post(f"/api/admin/utilisateurs/{uid}/reinitialisation", headers=h)
    assert r.status_code == 200 and "/admin/reinitialiser/" in r.json()["lien"]
    token = token_de(r.json()["lien"])
    assert client.get(f"/api/auth/jeton/{token}").json()["type"] == "reinitialisation"
    assert client.post(f"/api/auth/jeton/{token}", json={"password": "nouveaumdp2"}).status_code == 200

    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {ancienne_session}"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "esther@test.cm", "password": "ancienmdp1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "esther@test.cm", "password": "nouveaumdp2"}).status_code == 200


def test_mot_de_passe_oublie(client):  # noqa: F811
    h = admin_headers(client)
    assert client.get("/api/auth/options").json() == {"mot_de_passe_oublie": False}
    assert client.post("/api/auth/mot-de-passe-oublie", json={"email": "chef@test.cm"}).status_code == 503

    configurer_email(client, h)
    assert client.get("/api/auth/options").json() == {"mot_de_passe_oublie": True}
    inconnu = client.post("/api/auth/mot-de-passe-oublie", json={"email": "personne@test.cm"})
    connu = client.post("/api/auth/mot-de-passe-oublie", json={"email": "CHEF@test.cm"})
    assert inconnu.status_code == connu.status_code == 202
    assert inconnu.json() == connu.json()  # ne révèle pas si le compte existe
    assert len(ENVOYES) == 1 and ENVOYES[0]["To"] == "chef@test.cm"
    token = re.search(r"/admin/reinitialiser/(\S+)", corps(ENVOYES[0])).group(1)
    r = client.post(f"/api/auth/jeton/{token}", json={"password": "toutnouveau9"})
    assert r.status_code == 200 and r.json()["utilisateur"]["email"] == "chef@test.cm"


def test_config_email_secret_et_test(client):  # noqa: F811
    h = admin_headers(client)
    assert configurer_email(client, h, actif=True).json()["mot_de_passe_defini"] is True
    lu = client.get("/api/admin/email", headers=h).json()
    assert "mot_de_passe" not in lu and lu["dernier_test_ok_at"] is None
    with SessionLocal() as db:  # chiffré en base
        brut = db.get(ConfigEmail, 1).mot_de_passe_chiffre
        assert brut and "cle-smtp" not in brut and mailer.dechiffrer(brut) == "cle-smtp"

    r = client.post("/api/admin/email/test", headers=h, json={"destinataire": "moi@test.cm"})
    assert r.status_code == 200 and ENVOYES[-1]["To"] == "moi@test.cm"
    assert client.get("/api/admin/email", headers=h).json()["dernier_test_ok_at"] is not None

    # enregistrer sans mot de passe conserve l'ancien
    corps_sans_mdp = {**client.get("/api/admin/email", headers=h).json(), "mot_de_passe": ""}
    corps_sans_mdp["expediteur_nom"] = "Volontaires Kambo"
    for k in ("mot_de_passe_defini", "dernier_test_ok_at", "url_site"):
        corps_sans_mdp.pop(k)
    assert client.put("/api/admin/email", headers=h, json=corps_sans_mdp).json()["mot_de_passe_defini"] is True

    FauxSMTP.refuser_login = True
    r = client.post("/api/admin/email/test", headers=h, json={"destinataire": "moi@test.cm"})
    assert r.status_code == 502 and "refusé" in r.json()["detail"]

    # activation impossible sans serveur
    r = client.put("/api/admin/email", headers=h, json={"actif": True, "hote": "", "expediteur_email": ""})
    assert r.status_code == 422


def test_email_et_liens_reserves_au_responsable(client):  # noqa: F811
    h = admin_headers(client)
    client.post("/api/admin/utilisateurs", headers=h, json={
        "nom": "Adj", "email": "adj@test.cm", "role": "adjoint", "password": "adjoint123"})
    t = client.post("/api/auth/login", json={"email": "adj@test.cm", "password": "adjoint123"}).json()["token"]
    ha = {"Authorization": f"Bearer {t}"}
    assert client.get("/api/admin/email", headers=ha).status_code == 403
    assert client.post("/api/admin/utilisateurs/inviter", headers=ha, json={"nom": "X Y", "role": "adjoint"}).status_code == 403


def test_changer_son_mot_de_passe_renvoie_une_session(client):  # noqa: F811
    h = admin_headers(client)
    r = client.post("/api/auth/mot-de-passe", headers=h, json={"ancien": "motdepasse123", "nouveau": "motdepasse456"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401  # ancienne session fermée
    nouvelle = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/api/auth/me", headers=nouvelle).status_code == 200
