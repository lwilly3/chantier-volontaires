import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/session";
import type { ConfigEmail, Fournisseur } from "../../lib/types";

interface Prereglage {
  nom: string;
  hote: string;
  port: number;
  securite: ConfigEmail["securite"];
  utilisateur?: string;
  libelleUtilisateur: string;
  libelleMotDePasse: string;
  aide: React.ReactNode;
}

const PREREGLAGES: Record<Fournisseur, Prereglage> = {
  brevo: {
    nom: "Brevo (gratuit : 300 e-mails/jour)",
    hote: "smtp-relay.brevo.com",
    port: 587,
    securite: "starttls",
    libelleUtilisateur: "Identifiant SMTP (se termine par @smtp-brevo.com)",
    libelleMotDePasse: "Clé SMTP",
    aide: (
      <>
        Crée un compte sur brevo.com, puis <b>Paramètres → SMTP & API → Générer une clé SMTP</b>. Ajoute et
        authentifie le domaine <b>sallekambo.org</b> dans <b>Expéditeurs, domaines et IP dédiées</b> : Brevo
        te donne les enregistrements DNS à copier dans Cloudflare.
      </>
    ),
  },
  resend: {
    nom: "Resend (gratuit : 100 e-mails/jour)",
    hote: "smtp.resend.com",
    port: 465,
    securite: "ssl",
    utilisateur: "resend",
    libelleUtilisateur: "Identifiant (toujours « resend »)",
    libelleMotDePasse: "Clé API (commence par re_)",
    aide: (
      <>
        Crée un compte sur resend.com, ajoute le domaine <b>sallekambo.org</b> dans <b>Domains</b> (Resend peut
        configurer Cloudflare automatiquement), puis crée une clé dans <b>API Keys</b> avec l'accès « Sending ».
      </>
    ),
  },
  gmail: {
    nom: "Gmail (adresse personnelle)",
    hote: "smtp.gmail.com",
    port: 587,
    securite: "starttls",
    libelleUtilisateur: "Adresse Gmail",
    libelleMotDePasse: "Mot de passe d'application (16 lettres)",
    aide: (
      <>
        Active la validation en deux étapes sur le compte Google, puis crée un <b>mot de passe d'application</b>{" "}
        (myaccount.google.com → Sécurité). L'adresse d'expéditeur doit être cette même adresse Gmail. Solution de
        dépannage : préfère Brevo ou Resend avec ton domaine.
      </>
    ),
  },
  autre: {
    nom: "Autre serveur SMTP",
    hote: "",
    port: 587,
    securite: "starttls",
    libelleUtilisateur: "Identifiant SMTP",
    libelleMotDePasse: "Mot de passe SMTP",
    aide: <>Renseigne les paramètres SMTP fournis par ton hébergeur de messagerie.</>,
  },
};

export default function ReglagesEmail({ config, onChange }: { config: ConfigEmail; onChange: (c: ConfigEmail) => void }) {
  const { session } = useSession();
  const [f, setF] = useState({ ...config, mot_de_passe: "" });
  const [destinataire, setDestinataire] = useState(session?.utilisateur.email ?? "");
  const [etat, setEtat] = useState({ erreur: "", ok: "" });
  const [test, setTest] = useState({ erreur: "", ok: "" });
  const [occupe, setOccupe] = useState(false);
  const p = PREREGLAGES[f.fournisseur];
  const modifie =
    JSON.stringify({ ...config, mot_de_passe: "" }) !== JSON.stringify({ ...f, dernier_test_ok_at: config.dernier_test_ok_at });

  const choisirFournisseur = (fournisseur: Fournisseur) => {
    const pr = PREREGLAGES[fournisseur];
    setF({
      ...f,
      fournisseur,
      hote: pr.hote || f.hote,
      port: pr.port,
      securite: pr.securite,
      utilisateur: pr.utilisateur ?? (fournisseur === f.fournisseur ? f.utilisateur : ""),
    });
  };

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setEtat({ erreur: "", ok: "" });
    setOccupe(true);
    try {
      const c = await api<ConfigEmail>("/api/admin/email", {
        method: "PUT",
        json: {
          actif: f.actif, fournisseur: f.fournisseur, hote: f.hote, port: Number(f.port), securite: f.securite,
          utilisateur: f.utilisateur, mot_de_passe: f.mot_de_passe || null,
          expediteur_email: f.expediteur_email || null, expediteur_nom: f.expediteur_nom,
        },
      });
      onChange(c);
      setF({ ...c, mot_de_passe: "" });
      setEtat({ erreur: "", ok: c.actif ? "Réglages enregistrés. Envoie un e-mail de test pour vérifier." : "Réglages enregistrés (envoi désactivé)." });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    } finally {
      setOccupe(false);
    }
  };

  const tester = async () => {
    setTest({ erreur: "", ok: "" });
    setOccupe(true);
    try {
      const r = await api<{ message: string }>("/api/admin/email/test", { method: "POST", json: { destinataire } });
      setTest({ erreur: "", ok: `${r.message}. Vérifie la boîte de réception (et les spams).` });
      onChange(await api<ConfigEmail>("/api/admin/email"));
    } catch (err) {
      setTest({ erreur: (err as ApiError).message, ok: "" });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section className="carte">
      <div className="titre-section">
        <h2>Envoi d'e-mails</h2>
        <span className={`badge ${config.actif ? (config.dernier_test_ok_at ? "ok" : "presque") : "vide"}`}>
          {config.actif ? (config.dernier_test_ok_at ? "Activé" : "Activé · non testé") : "Désactivé"}
        </span>
      </div>
      <p className="aide">
        Facultatif. Une fois activé, les invitations et liens de réinitialisation partent automatiquement par
        e-mail, et « Mot de passe oublié ? » apparaît sur la page de connexion. Sans e-mail, tout reste possible
        par lien WhatsApp.
      </p>

      <form className="formulaire" onSubmit={enregistrer}>
        <label className="case-a-cocher">
          <input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} />
          <span><b>Activer l'envoi d'e-mails</b></span>
        </label>

        <label className="champ">
          <span>Fournisseur</span>
          <select value={f.fournisseur} onChange={(e) => choisirFournisseur(e.target.value as Fournisseur)}>
            {(Object.keys(PREREGLAGES) as Fournisseur[]).map((k) => (
              <option key={k} value={k}>{PREREGLAGES[k].nom}</option>
            ))}
          </select>
        </label>
        <p className="encart">{p.aide}</p>

        <div className="deux-colonnes">
          <label className="champ">
            <span>Serveur SMTP</span>
            <input value={f.hote} onChange={(e) => setF({ ...f, hote: e.target.value })} placeholder="smtp.exemple.com" />
          </label>
          <div className="deux-colonnes serre">
            <label className="champ">
              <span>Port</span>
              <input type="number" min={1} max={65535} value={f.port} onChange={(e) => setF({ ...f, port: Number(e.target.value) })} />
            </label>
            <label className="champ">
              <span>Sécurité</span>
              <select value={f.securite} onChange={(e) => setF({ ...f, securite: e.target.value as ConfigEmail["securite"] })}>
                <option value="starttls">STARTTLS</option>
                <option value="ssl">SSL/TLS</option>
                <option value="aucune">Aucune</option>
              </select>
            </label>
          </div>
          <label className="champ">
            <span>{p.libelleUtilisateur}</span>
            <input autoComplete="off" value={f.utilisateur} onChange={(e) => setF({ ...f, utilisateur: e.target.value })} />
          </label>
          <label className="champ">
            <span>{p.libelleMotDePasse}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={f.mot_de_passe}
              onChange={(e) => setF({ ...f, mot_de_passe: e.target.value })}
              placeholder={config.mot_de_passe_defini ? "•••••••• enregistré — laisser vide pour conserver" : ""}
            />
          </label>
          <label className="champ">
            <span>Adresse d'expéditeur</span>
            <input
              type="email"
              value={f.expediteur_email}
              onChange={(e) => setF({ ...f, expediteur_email: e.target.value })}
              placeholder="volontaires@sallekambo.org"
            />
          </label>
          <label className="champ">
            <span>Nom d'expéditeur</span>
            <input value={f.expediteur_nom} onChange={(e) => setF({ ...f, expediteur_nom: e.target.value })} />
          </label>
        </div>
        <p className="aide">Les liens envoyés pointent vers <b>{config.url_site}</b>. Le mot de passe SMTP est stocké chiffré.</p>

        {etat.erreur && <p className="alerte">{etat.erreur}</p>}
        {etat.ok && <p className="ok">{etat.ok}</p>}
        <button className="bouton principal" disabled={occupe || !modifie}>Enregistrer</button>
      </form>

      <div className="sous-carte">
        <h3>Tester l'envoi</h3>
        {config.dernier_test_ok_at ? (
          <p className="aide">Dernier test réussi le {new Date(config.dernier_test_ok_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.</p>
        ) : (
          <p className="aide">Enregistre d'abord les réglages, puis envoie-toi un e-mail de test.</p>
        )}
        <div className="ligne-test">
          <input type="email" value={destinataire} onChange={(e) => setDestinataire(e.target.value)} placeholder="ton@adresse.com" />
          <button type="button" className="bouton" disabled={occupe || modifie || !destinataire || !config.hote} onClick={tester}>
            {occupe ? "Envoi…" : "Envoyer un test"}
          </button>
        </div>
        {modifie && <p className="aide">Enregistre tes modifications avant de tester.</p>}
        {test.erreur && <p className="alerte">{test.erreur}</p>}
        {test.ok && <p className="ok">{test.ok}</p>}
      </div>
    </section>
  );
}
