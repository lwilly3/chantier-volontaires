"""Envoi d'e-mails via le fournisseur SMTP configuré par le responsable (Réglages → E-mails)."""
import base64
from html import escape
import hashlib
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from .config import settings
from .models import ConfigEmail

# Le mot de passe SMTP est chiffré en base avec une clé dérivée de JWT_SECRET.
# Si JWT_SECRET change, il suffit de ressaisir le mot de passe dans les réglages.
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"smtp:{settings.jwt_secret}".encode()).digest()))


class EmailErreur(Exception):
    pass


def chiffrer(texte: str) -> str:
    return _fernet.encrypt(texte.encode()).decode() if texte else ""


def dechiffrer(texte: str) -> str:
    if not texte:
        return ""
    try:
        return _fernet.decrypt(texte.encode()).decode()
    except InvalidToken:
        return ""


def get_config(db: Session) -> ConfigEmail:
    c = db.get(ConfigEmail, 1)
    if c is None:
        c = ConfigEmail(id=1)
        db.add(c)
        db.commit()
    return c


def email_disponible(db: Session) -> bool:
    c = db.get(ConfigEmail, 1)
    return bool(c and c.actif and c.hote and c.expediteur_email)


def envoyer(c: ConfigEmail, destinataire: str, sujet: str, texte: str, html: str) -> None:
    """Envoie un e-mail ; lève EmailErreur avec un message compréhensible en cas d'échec."""
    if not c.hote or not c.expediteur_email:
        raise EmailErreur("Le serveur d'envoi n'est pas configuré")
    msg = EmailMessage()
    msg["Subject"] = sujet
    msg["From"] = formataddr((c.expediteur_nom or "Service volontaires", c.expediteur_email))
    msg["To"] = destinataire
    msg["Message-ID"] = make_msgid(domain=c.expediteur_email.split("@")[-1])
    msg.set_content(texte)
    msg.add_alternative(html, subtype="html")

    mot_de_passe = dechiffrer(c.mot_de_passe_chiffre)
    contexte = ssl.create_default_context()
    try:
        if c.securite == "ssl":
            serveur = smtplib.SMTP_SSL(c.hote, c.port, timeout=20, context=contexte)
        else:
            serveur = smtplib.SMTP(c.hote, c.port, timeout=20)
        with serveur:
            if c.securite == "starttls":
                serveur.starttls(context=contexte)
            if c.utilisateur:
                serveur.login(c.utilisateur, mot_de_passe)
            serveur.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise EmailErreur("Identifiant ou mot de passe SMTP refusé par le fournisseur")
    except smtplib.SMTPSenderRefused:
        raise EmailErreur("Adresse d'expéditeur refusée : vérifiez qu'elle est validée chez le fournisseur")
    except smtplib.SMTPRecipientsRefused:
        raise EmailErreur(f"Adresse du destinataire refusée : {destinataire}")
    except (smtplib.SMTPException, OSError) as e:
        raise EmailErreur(f"Envoi impossible ({type(e).__name__}) : {e}".strip())


# ------------------------------------------------------------------ modèles d'e-mails
def _gabarit(titre: str, paragraphes: list[str], bouton: str, lien: str, pied: str) -> str:
    corps = "".join(f'<p style="margin:0 0 14px">{p}</p>' for p in paragraphes)
    return f"""<!doctype html><html lang="fr"><body style="margin:0;background:#f6f3ec;font-family:Arial,Helvetica,sans-serif;color:#1d2a27">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #ddd6c8">
<tr><td style="background:#1f4e46;color:#ffffff;padding:18px 24px;border-radius:12px 12px 0 0">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85">Service volontaires</div>
<div style="font-size:18px;font-weight:bold">{titre}</div></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.5">{corps}
<p style="margin:22px 0"><a href="{lien}" style="background:#1f4e46;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">{bouton}</a></p>
<p style="margin:0;font-size:12px;color:#5d6b67">Si le bouton ne fonctionne pas, copiez ce lien :<br><span style="word-break:break-all">{lien}</span></p>
</td></tr>
<tr><td style="padding:14px 24px;font-size:12px;color:#5d6b67;border-top:1px solid #eee">{pied}</td></tr>
</table></td></tr></table></body></html>"""


def email_invitation(nom: str, role: str, lien: str, heures: int, invite_par: str) -> tuple[str, str, str]:
    prenom = nom.split(" ")[0]
    h_prenom, h_role, h_par = escape(prenom), escape(role), escape(invite_par)
    sujet = "Invitation — espace équipe du service volontaires"
    texte = (
        f"Bonjour {prenom},\n\n{invite_par} vous invite à rejoindre l'espace équipe du service volontaires "
        f"(chantier de rénovation de la Salle du Royaume) avec le rôle « {role} ».\n\n"
        f"Créez votre mot de passe ici (lien valable {heures} h, utilisable une seule fois) :\n{lien}\n\n"
        "Si vous n'attendiez pas ce message, ignorez-le."
    )
    html = _gabarit(
        "Invitation à l'espace équipe",
        [
            f"Bonjour {h_prenom},",
            f"{h_par} vous invite à rejoindre l'espace équipe du service volontaires "
            f"(rénovation de la Salle du Royaume) avec le rôle <b>{h_role}</b>.",
            f"Choisissez votre mot de passe pour activer votre compte. Ce lien est valable <b>{heures} h</b> "
            "et ne fonctionne qu'une seule fois.",
        ],
        "Créer mon mot de passe",
        lien,
        "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet e-mail.",
    )
    return sujet, texte, html


def email_reinitialisation(nom: str, lien: str, minutes: int) -> tuple[str, str, str]:
    prenom = nom.split(" ")[0]
    sujet = "Réinitialisation de votre mot de passe"
    texte = (
        f"Bonjour {prenom},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien "
        f"(valable {minutes} min, utilisable une seule fois) :\n{lien}\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable."
    )
    html = _gabarit(
        "Nouveau mot de passe",
        [
            f"Bonjour {escape(prenom)},",
            f"Pour choisir un nouveau mot de passe, utilisez le bouton ci-dessous. Le lien est valable "
            f"<b>{minutes} minutes</b> et ne fonctionne qu'une seule fois.",
        ],
        "Choisir un nouveau mot de passe",
        lien,
        "Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail : votre mot de passe actuel reste valable.",
    )
    return sujet, texte, html


def email_test(destinataire: str) -> tuple[str, str, str]:
    sujet = "Test d'envoi — service volontaires"
    texte = f"Ceci est un e-mail de test. Si vous le lisez à l'adresse {destinataire}, l'envoi fonctionne."
    html = _gabarit(
        "Test d'envoi réussi",
        ["La configuration de l'envoi d'e-mails fonctionne.", "Les invitations et réinitialisations pourront être envoyées automatiquement."],
        "Ouvrir l'espace équipe",
        f"{settings.front_url}/admin",
        "E-mail envoyé depuis Réglages → E-mails.",
    )
    return sujet, texte, html
