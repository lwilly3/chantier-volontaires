import { useEffect, useState, type FormEvent } from "react";
import Section from "../../components/Section";
import { api, ApiError } from "../../lib/api";
import { copier, lienWhatsApp } from "../../lib/liens";
import type { Parametres } from "../../lib/types";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const genererMotDePasse = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(8)), (v) => ALPHABET[v % ALPHABET.length]).join("");

/** Lien dédié /presences, protégé par un mot de passe, pour les personnes chargées de compter les présents. */
export default function LienPresences() {
  const [p, setP] = useState<Parametres | null>(null);
  const [actif, setActif] = useState(false);
  const [mdp, setMdp] = useState("");
  const [dernierMdp, setDernierMdp] = useState(""); // affiché une seule fois, juste après l'enregistrement
  const [etat, setEtat] = useState({ erreur: "", ok: "" });
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    api<Parametres>("/api/admin/parametres").then((d) => {
      setP(d);
      setActif(d.presences_actif);
    });
  }, []);

  if (!p) return null;
  const lien = `${window.location.origin}/presences`;
  const message =
    "Bonjour ! Merci de t'occuper de compter les présents sur le chantier de la Salle du Royaume. " +
    `Chaque jour, indique à peu près combien de personnes étaient là ici : ${lien}` +
    (dernierMdp ? `\nMot de passe : *${dernierMdp}*` : "\nMot de passe : (communiqué à part)");

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setEtat({ erreur: "", ok: "" });
    try {
      const d = await api<Parametres>("/api/admin/presences-acces", {
        method: "PUT",
        json: { actif, mot_de_passe: mdp || null },
      });
      setP(d);
      setActif(d.presences_actif);
      if (mdp) setDernierMdp(mdp);
      setMdp("");
      setEtat({
        erreur: "",
        ok: d.presences_actif
          ? mdp
            ? "Lien activé avec le nouveau mot de passe. Les personnes connectées avec l'ancien devront le ressaisir."
            : "Lien activé."
          : "Lien désactivé : plus personne ne peut saisir par le lien.",
      });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    }
  };

  return (
    <Section
      id="presences"
      titre="Saisie des présences"
      resume="Lien protégé pour indiquer les présents du jour"
      badge={<span className={`badge ${p.presences_actif ? "ok" : "vide"}`}>{p.presences_actif ? "Lien actif" : "Désactivé"}</span>}
    >
      <p className="aide">
        Facultatif. Un lien dédié, protégé par mot de passe, permet aux personnes désignées d'indiquer chaque jour
        le nombre approximatif de présents. Elles ne voient rien d'autre de l'application. Les responsables et
        adjoints peuvent aussi le faire depuis la fiche du jour (Couverture). Ces chiffres alimentent l'onglet Analyses.
      </p>
      <form className="formulaire" onSubmit={enregistrer}>
        <label className="case-a-cocher">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          <span><b>Activer le lien de saisie</b></span>
        </label>
        {actif && (
        <label className="champ">
          <span>
            {p.presences_mdp_defini ? "Nouveau mot de passe" : "Mot de passe"}{" "}
            <small>({p.presences_mdp_defini ? "laisser vide pour garder l'actuel" : "6 caractères minimum"})</small>
          </span>
          <div className="ligne-test">
            <input autoComplete="new-password" spellCheck={false} value={mdp} onChange={(e) => setMdp(e.target.value)} />
            <button type="button" className="bouton" onClick={() => setMdp(genererMotDePasse())}>Générer</button>
          </div>
        </label>
        )}
        {etat.erreur && <p className="alerte">{etat.erreur}</p>}
        {etat.ok && <p className="ok">{etat.ok}</p>}
        <button className="bouton principal" disabled={actif === p.presences_actif && !mdp}>Enregistrer</button>
      </form>

      {p.presences_actif && (
        <div className="sous-carte">
          <h3>Message pour les personnes désignées</h3>
          <code className="lien">{lien}</code>
          {!dernierMdp && (
            <p className="aide">
              Pour des raisons de sécurité, le mot de passe n'est pas réaffiché. Communique-le à part, ou définis-en un
              nouveau pour l'inclure dans le message.
            </p>
          )}
          <pre className="apercu-message">{message}</pre>
          <div className="actions">
            <a className="bouton whatsapp" href={lienWhatsApp(message)} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
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
      )}
    </Section>
  );
}
