import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { copier, lienWhatsApp } from "../../lib/liens";
import type { Parametres } from "../../lib/types";

// Sans 0/O ni 1/I/L pour éviter les confusions à la lecture
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genererCode(): string {
  const valeurs = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(valeurs, (v) => ALPHABET[v % ALPHABET.length]).join("");
}

/** Code demandé avant d'accéder au formulaire d'inscription public. */
export default function AccesFormulaire() {
  const [enregistre, setEnregistre] = useState<{ actif: boolean; code: string } | null>(null);
  const [actif, setActif] = useState(false);
  const [code, setCode] = useState("");
  const [etat, setEtat] = useState({ erreur: "", ok: "" });
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    api<Parametres>("/api/admin/parametres").then((p) => {
      setEnregistre({ actif: p.code_acces_actif, code: p.code_acces });
      setActif(p.code_acces_actif);
      setCode(p.code_acces);
    });
  }, []);

  if (!enregistre) return null;
  const modifie = actif !== enregistre.actif || code.trim() !== enregistre.code;
  const lienSite = window.location.origin;
  const message =
    "Bonjour ! Pour t'inscrire comme volontaire au chantier de rénovation de notre Salle du Royaume " +
    `(du lundi au samedi), ouvre ce lien : ${lienSite}\n` +
    `Code d'accès : *${enregistre.code}*\n` +
    "Tu pourras ensuite indiquer tes compétences et les jours où tu peux venir.";

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setEtat({ erreur: "", ok: "" });
    try {
      const p = await api<Parametres>("/api/admin/acces-formulaire", {
        method: "PUT",
        json: { code_acces_actif: actif, code_acces: code },
      });
      setEnregistre({ actif: p.code_acces_actif, code: p.code_acces });
      setCode(p.code_acces);
      setEtat({
        erreur: "",
        ok: p.code_acces_actif
          ? "Code activé. Les volontaires devront le saisir pour accéder au formulaire."
          : "Code désactivé : le formulaire est accessible à toute personne ayant le lien.",
      });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    }
  };

  return (
    <section className="carte">
      <div className="titre-section">
        <h2>Accès au formulaire d'inscription</h2>
        <span className={`badge ${enregistre.actif ? "ok" : "vide"}`}>
          {enregistre.actif ? "Protégé par code" : "Accès libre"}
        </span>
      </div>
      <p className="aide">
        Quand le code est activé, la page d'inscription demande ce code avant d'afficher le formulaire, y compris
        pour les liens de recrutement de l'équipe. Les volontaires déjà inscrits gardent l'accès à leur lien
        personnel sans code.
      </p>

      <form className="formulaire" onSubmit={enregistrer}>
        <label className="case-a-cocher">
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          <span><b>Exiger un code d'accès</b></span>
        </label>
        <label className="champ">
          <span>Code <small>(4 caractères minimum, majuscules et espaces ignorés)</small></span>
          <div className="ligne-test">
            <input
              className="code-saisie"
              autoComplete="off"
              spellCheck={false}
              value={code}
              maxLength={40}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex. KAMBO26"
            />
            <button type="button" className="bouton" onClick={() => setCode(genererCode())}>Générer</button>
          </div>
        </label>
        <p className="aide">
          Changer le code n'affecte pas les volontaires déjà inscrits : seules les nouvelles inscriptions devront
          utiliser le nouveau code.
        </p>
        {etat.erreur && <p className="alerte">{etat.erreur}</p>}
        {etat.ok && <p className="ok">{etat.ok}</p>}
        <button className="bouton principal" disabled={!modifie}>Enregistrer</button>
      </form>

      {enregistre.actif && (
        <div className="sous-carte">
          <h3>Message à envoyer aux volontaires</h3>
          <pre className="apercu-message">{message}</pre>
          <div className="actions">
            <a className="bouton whatsapp" href={lienWhatsApp(message)} target="_blank" rel="noreferrer">
              Partager sur WhatsApp
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
      )}
    </section>
  );
}
