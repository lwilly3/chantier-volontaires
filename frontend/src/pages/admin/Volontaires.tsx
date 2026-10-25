import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, telecharger } from "../../lib/api";
import { court } from "../../lib/dates";
import { useSession } from "../../lib/session";
import type { Parametres, VolontaireAdmin } from "../../lib/types";

export default function Volontaires() {
  const [params, setParams] = useState<Parametres | null>(null);
  const [liste, setListe] = useState<VolontaireAdmin[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [q, setQ] = useState("");
  const [assemblee, setAssemblee] = useState("");
  const [competence, setCompetence] = useState("");
  const [statut, setStatut] = useState("actifs");
  const [params2] = useSearchParams();
  const [recrues, setRecrues] = useState(params2.get("recrute_par") === "moi" ? "moi" : "");
  const { peut } = useSession();
  const equipe = peut("responsable", "adjoint");

  useEffect(() => {
    api<Parametres>("/api/admin/parametres").then(setParams).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ statut });
      if (q.trim()) p.set("q", q.trim());
      if (assemblee) p.set("assemblee", assemblee);
      if (competence) p.set("competence", competence);
      if (recrues) p.set("recrute_par", recrues);
      api<VolontaireAdmin[]>(`/api/admin/volontaires?${p}`)
        .then(setListe)
        .catch((e: ApiError) => setErreur(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, assemblee, competence, statut, recrues]);

  return (
    <div className="volontaires">
      <div className="titre-section">
        <h2>Volontaires {liste && <small>({liste.length})</small>}</h2>
        <div className="actions">
          {equipe && (
            <button className="bouton" onClick={() => telecharger("/api/admin/export/volontaires.csv", "volontaires.csv")}>
              Export Excel (CSV)
            </button>
          )}
          <Link className="bouton principal" to="/admin/volontaires/nouveau">
            + Ajouter
          </Link>
        </div>
      </div>

      <div className="filtres">
        <input type="search" placeholder="Nom ou téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={assemblee} onChange={(e) => setAssemblee(e.target.value)}>
          <option value="">Toutes les assemblées</option>
          {params?.assemblees.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select value={competence} onChange={(e) => setCompetence(e.target.value)}>
          <option value="">Toutes compétences</option>
          {params?.competences.map((c) => <option key={c}>{c}</option>)}
          <option>Autre</option>
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="actifs">Actifs</option>
          <option value="inactifs">Désactivés</option>
          <option value="tous">Tous</option>
        </select>
        <select value={recrues} onChange={(e) => setRecrues(e.target.value)}>
          <option value="">Tous les recruteurs</option>
          <option value="moi">Mes recrues</option>
        </select>
      </div>

      {erreur && <p className="alerte">{erreur}</p>}
      {!liste ? (
        <p className="chargement">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="vide-msg">Aucun volontaire ne correspond.</p>
      ) : (
        <ul className="liste-volontaires">
          {liste.map((v) => {
            const prochains = v.disponibilites.length;
            return (
              <li key={v.id} className={v.actif ? "" : "inactif"}>
                <Link to={`/admin/volontaires/${v.id}`}>
                  <div className="ligne1">
                    <b>{v.nom}</b>
                    <span className={`badge ${prochains === 0 ? "vide" : "ok"}`}>{prochains} j</span>
                  </div>
                  <div className="meta">
                    {v.assemblee} · {v.telephone}
                    {v.est_mineur && " · mineur"}
                    {v.recrute_par ? ` · recruté par ${v.recrute_par}` : v.source === "adjoint" ? " · saisi par l'équipe" : ""}
                  </div>
                  {v.competences.length > 0 && <div className="meta">{v.competences.join(", ")}</div>}
                  {prochains > 0 && (
                    <div className="meta">
                      {v.disponibilites.slice(0, 4).map((d) => court(d.jour)).join(", ")}
                      {prochains > 4 && ` +${prochains - 4}`}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
