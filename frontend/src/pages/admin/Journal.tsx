import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import type { EntreeJournal } from "../../lib/types";

export const LIBELLE_ACTION: Record<string, string> = {
  inscription: "Inscription",
  modification: "Modification",
  desactivation: "Désactivation",
  reactivation: "Réactivation",
  suppression: "Suppression",
  nouveau_lien: "Nouveau lien",
  parametres: "Réglages modifiés",
  lien_invitation: "Invitation envoyée",
  lien_reinitialisation: "Lien de mot de passe créé",
  invitation_acceptee: "Invitation acceptée",
  invitation_annulee: "Invitation annulée",
  mot_de_passe_reinitialise: "Mot de passe réinitialisé",
  reinitialisation_demandee: "Mot de passe oublié (demande)",
  config_email: "Réglages e-mail modifiés",
  code_acces: "Code d'accès modifié",
  presences: "Présents constatés",
  lien_presences: "Lien de saisie des présences",
};

export default function Journal() {
  const [entrees, setEntrees] = useState<EntreeJournal[] | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api<EntreeJournal[]>("/api/admin/journal?limite=200").then(setEntrees).catch((e: ApiError) => setErreur(e.message));
  }, []);

  if (erreur) return <p className="alerte">{erreur}</p>;
  if (!entrees) return <p className="chargement">Chargement…</p>;

  return (
    <section className="carte">
      <h2>Derniers changements</h2>
      {entrees.length === 0 ? (
        <p className="vide-msg">Aucun changement pour l'instant.</p>
      ) : (
        <ul className="journal">
          {entrees.map((j) => (
            <li key={j.id}>
              <time>{new Date(j.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
              <span>
                <b>{LIBELLE_ACTION[j.action] ?? j.action}</b>
                {j.volontaire_id && j.volontaire ? (
                  <> — <Link to={`/admin/volontaires/${j.volontaire_id}`}>{j.volontaire}</Link></>
                ) : null}
                <small> · {j.acteur}{j.details && ` · ${j.details}`}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
