import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

const PAR_PAGE = 50;

export default function Journal() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [entrees, setEntrees] = useState<EntreeJournal[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api<{ total: number }>("/api/admin/journal/nombre").then((r) => setTotal(r.total)).catch(() => {});
  }, []);

  useEffect(() => {
    setEntrees(null);
    api<EntreeJournal[]>(`/api/admin/journal?limite=${PAR_PAGE}&decalage=${(page - 1) * PAR_PAGE}`)
      .then(setEntrees)
      .catch((e: ApiError) => setErreur(e.message));
  }, [page]);

  const nbPages = total !== null ? Math.max(1, Math.ceil(total / PAR_PAGE)) : null;
  const aSuivante = nbPages !== null ? page < nbPages : (entrees?.length ?? 0) === PAR_PAGE;
  const allerA = (p: number) => {
    setParams(p > 1 ? { page: String(p) } : {});
    window.scrollTo({ top: 0 });
  };

  if (erreur) return <p className="alerte">{erreur}</p>;
  if (!entrees) return <p className="chargement">Chargement…</p>;

  const pagination = (page > 1 || aSuivante) && (
    <nav className="pagination" aria-label="Pages du journal">
      <button className="bouton petit" disabled={page <= 1} onClick={() => allerA(1)} aria-label="Première page">«</button>
      <button className="bouton petit" disabled={page <= 1} onClick={() => allerA(page - 1)}>‹ Plus récents</button>
      <span>Page {page}{nbPages !== null && ` sur ${nbPages}`}</span>
      <button className="bouton petit" disabled={!aSuivante} onClick={() => allerA(page + 1)}>Plus anciens ›</button>
      {nbPages !== null && (
        <button className="bouton petit" disabled={!aSuivante} onClick={() => allerA(nbPages)} aria-label="Dernière page">»</button>
      )}
    </nav>
  );

  return (
    <section className="carte">
      <h2>Derniers changements{total !== null && total > 0 && <small> · {total} au total</small>}</h2>
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
      {pagination}
    </section>
  );
}
