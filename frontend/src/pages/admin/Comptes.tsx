import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { copier, lienWhatsApp } from "../../lib/liens";
import { LIBELLE_ROLE, useSession } from "../../lib/session";
import type { LienCompte, Role, Utilisateur } from "../../lib/types";

const ROLES = Object.keys(LIBELLE_ROLE) as Role[];
const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

type Formulaire =
  | { mode: "inviter"; nom: string; email: string; role: Role; envoyer_email: boolean }
  | { mode: "modifier"; id: number; nom: string; email: string; role: Role; actif: boolean; password: string; statut: Utilisateur["statut"] };

export default function Comptes({ emailActif }: { emailActif: boolean }) {
  const { session } = useSession();
  const [comptes, setComptes] = useState<Utilisateur[]>([]);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [resultat, setResultat] = useState<{ type: "invitation" | "reinitialisation"; data: LienCompte } | null>(null);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  const charger = () => api<Utilisateur[]>("/api/admin/utilisateurs").then(setComptes);
  useEffect(() => {
    charger();
  }, []);

  const action = async (fn: () => Promise<void>) => {
    setErreur("");
    setOccupe(true);
    try {
      await fn();
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setOccupe(false);
    }
  };

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    action(async () => {
      if (form.mode === "inviter") {
        const data = await api<LienCompte>("/api/admin/utilisateurs/inviter", {
          method: "POST",
          json: { nom: form.nom, email: form.email || null, role: form.role, envoyer_email: form.envoyer_email },
        });
        setResultat({ type: "invitation", data });
      } else {
        await api(`/api/admin/utilisateurs/${form.id}`, {
          method: "PUT",
          json: { nom: form.nom, email: form.email || null, role: form.role, actif: form.actif, password: form.password || null },
        });
      }
      setForm(null);
      await charger();
    });
  };

  const genererLien = (u: Utilisateur, type: "invitation" | "reinitialisation") =>
    action(async () => {
      const chemin = type === "invitation" ? "invitation" : "reinitialisation";
      const data = await api<LienCompte>(`/api/admin/utilisateurs/${u.id}/${chemin}?envoyer_email=${emailActif}`, { method: "POST" });
      setResultat({ type, data });
      setForm(null);
      await charger();
    });

  const annulerInvitation = (u: Utilisateur) => {
    if (!confirm(`Annuler l'invitation de ${u.nom} ?`)) return;
    action(async () => {
      await api(`/api/admin/utilisateurs/${u.id}`, { method: "DELETE" });
      await charger();
    });
  };

  return (
    <section className="carte">
      <div className="titre-section">
        <h2>Comptes de l'équipe</h2>
        <button
          className="bouton principal"
          onClick={() => {
            setResultat(null);
            setForm({ mode: "inviter", nom: "", email: "", role: "adjoint", envoyer_email: true });
          }}
        >
          + Inviter
        </button>
      </div>
      <p className="aide">
        <b>Adjoint</b> : gère les volontaires. <b>Homme clé</b> : inscrit, modifie et désactive des volontaires, voit
        les listes du jour et recrute avec son propre lien (sans export, journal, suppression ni réglages).{" "}
        <b>Cuisine</b> et <b>Comité</b> : voient uniquement les effectifs par jour.
        La personne invitée choisit elle-même son mot de passe grâce au lien reçu.
      </p>

      {resultat && <PanneauLien type={resultat.type} data={resultat.data} onFermer={() => setResultat(null)} />}

      {form && (
        <form className="formulaire sous-carte" onSubmit={enregistrer}>
          <h3>{form.mode === "inviter" ? "Inviter une personne" : "Modifier le compte"}</h3>
          <label className="champ">
            <span>Nom</span>
            <input required minLength={2} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </label>
          <label className="champ">
            <span>
              E-mail{" "}
              <small>
                {form.mode === "inviter" ? "(facultatif : la personne pourra le saisir elle-même)" : form.statut === "invite" ? "(facultatif)" : ""}
              </small>
            </span>
            <input
              type="email"
              required={form.mode === "modifier" && form.statut !== "invite"}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="champ">
            <span>Rôle</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>
              ))}
            </select>
          </label>

          {form.mode === "inviter" ? (
            <label className={`case-a-cocher ${!emailActif || !form.email ? "desactive" : ""}`}>
              <input
                type="checkbox"
                disabled={!emailActif || !form.email}
                checked={emailActif && !!form.email && form.envoyer_email}
                onChange={(e) => setForm({ ...form, envoyer_email: e.target.checked })}
              />
              <span>
                Envoyer l'invitation par e-mail
                {!emailActif && <small> — envoi d'e-mails non activé, vous transmettrez le lien par WhatsApp</small>}
              </span>
            </label>
          ) : (
            <>
              {form.statut !== "invite" && (
                <label className="case-a-cocher">
                  <input
                    type="checkbox"
                    checked={form.actif}
                    disabled={form.id === session?.utilisateur.id}
                    onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                  />
                  <span>Compte actif <small>(décocher déconnecte immédiatement la personne)</small></span>
                </label>
              )}
              {form.statut !== "invite" && (
                <details className="avance">
                  <summary>Définir moi-même un mot de passe</summary>
                  <label className="champ">
                    <span>Nouveau mot de passe <small>(préférez le lien de réinitialisation)</small></span>
                    <input
                      type="text"
                      autoComplete="new-password"
                      minLength={8}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </label>
                </details>
              )}
            </>
          )}

          {erreur && <p className="alerte">{erreur}</p>}
          <div className="actions">
            <button className="bouton principal" disabled={occupe}>
              {occupe ? "…" : form.mode === "inviter" ? "Créer l'invitation" : "Enregistrer"}
            </button>
            <button type="button" className="bouton discret" onClick={() => setForm(null)}>Annuler</button>
          </div>
        </form>
      )}

      {!form && erreur && <p className="alerte">{erreur}</p>}

      <ul className="comptes">
        {comptes.map((u) => (
          <li key={u.id} className={u.statut === "desactive" ? "inactif" : ""}>
            <div className="compte-infos">
              <b>{u.nom}</b>
              <small>{u.email ?? "e-mail à saisir par la personne"}</small>
              {u.statut === "invite" && (
                <small className={u.invitation_expiree ? "texte-alerte" : ""}>
                  {u.invitation_expiree
                    ? "Invitation expirée"
                    : `Invitation en attente · expire le ${u.invitation_expire_at ? dateHeure(u.invitation_expire_at) : "?"}`}
                </small>
              )}
            </div>
            <div className="compte-badges">
              <span className="badge ok">{LIBELLE_ROLE[u.role]}</span>
              {u.statut === "invite" && <span className="badge presque">Invité</span>}
              {u.statut === "desactive" && <span className="badge vide">Désactivé</span>}
              {u.nb_recrues > 0 && <span className="badge statique-recrues">{u.nb_recrues} recrue{u.nb_recrues > 1 ? "s" : ""}</span>}
            </div>
            <div className="compte-actions">
              {u.statut === "invite" ? (
                <>
                  <button className="bouton petit" disabled={occupe} onClick={() => genererLien(u, "invitation")}>
                    {u.invitation_expiree ? "Nouvelle invitation" : "Renvoyer"}
                  </button>
                  <button className="bouton petit discret" disabled={occupe} onClick={() => annulerInvitation(u)}>Annuler</button>
                </>
              ) : (
                u.statut === "actif" &&
                u.id !== session?.utilisateur.id && (
                  <button className="bouton petit" disabled={occupe} onClick={() => genererLien(u, "reinitialisation")}>
                    Lien mot de passe
                  </button>
                )
              )}
              <button
                className="bouton petit discret"
                onClick={() => {
                  setResultat(null);
                  setForm({ mode: "modifier", id: u.id, nom: u.nom, email: u.email ?? "", role: u.role, actif: u.actif, password: "", statut: u.statut });
                }}
              >
                Modifier
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PanneauLien({ type, data, onFermer }: { type: "invitation" | "reinitialisation"; data: LienCompte; onFermer: () => void }) {
  const [copie, setCopie] = useState(false);
  const u = data.utilisateur;
  const prenom = u.nom.split(" ")[0];
  const message =
    type === "invitation"
      ? `Bonjour ${prenom}, tu es invité(e) à rejoindre l'espace équipe du service volontaires (chantier de la Salle du Royaume) en tant que ${LIBELLE_ROLE[u.role]}. Crée ton mot de passe ici (lien personnel, valable jusqu'au ${dateHeure(data.expire_at)}) : ${data.lien}`
      : `Bonjour ${prenom}, voici ton lien pour choisir un nouveau mot de passe sur l'espace équipe du service volontaires (valable jusqu'à ${new Date(data.expire_at).toLocaleTimeString("fr-FR", { timeStyle: "short" })}, une seule utilisation) : ${data.lien}`;

  return (
    <div className="panneau-lien">
      <div className="titre-section">
        <h3>{type === "invitation" ? `Invitation créée pour ${u.nom}` : `Lien de réinitialisation pour ${u.nom}`}</h3>
        <button className="bouton petit discret" onClick={onFermer} aria-label="Fermer">✕</button>
      </div>
      {data.email_envoye ? (
        <p className="ok">✓ E-mail envoyé à {u.email}.</p>
      ) : data.erreur_email ? (
        <p className="avertissement">E-mail non envoyé : {data.erreur_email}</p>
      ) : null}
      <p className="aide">
        Lien personnel, utilisable une seule fois, valable jusqu'au <b>{dateHeure(data.expire_at)}</b>. Ne le partagez qu'avec {prenom}.
      </p>
      <code className="lien">{data.lien}</code>
      <div className="actions">
        <a className="bouton whatsapp" href={lienWhatsApp(message)} target="_blank" rel="noreferrer">
          Envoyer par WhatsApp
        </a>
        <button
          type="button"
          className="bouton"
          onClick={async () => {
            setCopie(await copier(message));
            setTimeout(() => setCopie(false), 2000);
          }}
        >
          {copie ? "Copié ✓" : "Copier le message"}
        </button>
      </div>
    </div>
  );
}
