import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { court } from "../../lib/dates";
import type { Analyses as TAnalyses } from "../../lib/types";

const pct = (t: number | null) => (t == null ? "—" : `${Math.round(t * 100)} %`);

export default function Analyses() {
  const [a, setA] = useState<TAnalyses | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api<TAnalyses>("/api/admin/analyses").then(setA).catch((e: ApiError) => setErreur(e.message));
  }, []);

  if (erreur) return <p className="alerte">{erreur}</p>;
  if (!a) return <p className="chargement">Chargement…</p>;

  if (a.nb_jours_saisis === 0) {
    return (
      <section className="carte">
        <h2>Analyses</h2>
        <p>
          Aucune présence constatée pour l'instant. Dès que les présents d'une journée sont indiqués (fiche du jour dans
          Couverture, ou lien dédié de saisie), tu verras ici le taux de présence réel, la comparaison par jour de la
          semaine et une estimation des présents probables pour les jours à venir.
        </p>
      </section>
    );
  }

  const max = Math.max(1, ...a.jours.map((j) => Math.max(j.prevus, j.presents)));
  const prochains = a.prochains.filter((p) => p.probables != null).slice(0, 12);

  return (
    <div className="analyses">
      <section className="tuiles">
        <div className="tuile">
          <b>{pct(a.taux_global)}</b>
          <span>taux de présence (présents / prévus)</span>
        </div>
        <div className="tuile">
          <b>{a.nb_jours_saisis}</b>
          <span>jour{a.nb_jours_saisis > 1 ? "s" : ""} renseigné{a.nb_jours_saisis > 1 ? "s" : ""}</span>
        </div>
        <div className="tuile">
          <b>{a.total_presents}</b>
          <span>présents constatés pour {a.total_prevus} prévus</span>
        </div>
      </section>

      <section className="carte">
        <div className="titre-section">
          <h2>Prévus et présents</h2>
          <div className="legende-niveaux">
            <span className="niv barre-prevus">prévus</span>
            <span className="niv barre-presents">présents</span>
          </div>
        </div>
        <div className="graphe" role="img" aria-label="Comparaison des volontaires prévus et présents par jour">
          {a.jours.map((j) => (
            <div className="graphe-col" key={j.jour} title={`${court(j.jour)} : ${j.presents} présents / ${j.prevus} prévus`}>
              <div className="graphe-barres">
                <span className="barre-prevus" style={{ height: `${(j.prevus / max) * 100}%` }} />
                <span className="barre-presents" style={{ height: `${(j.presents / max) * 100}%` }} />
              </div>
              <span className="graphe-taux">{pct(j.taux)}</span>
              <span className="graphe-date">{court(j.jour).replace(/^\S+ /, "")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="carte">
        <h2>Par jour de la semaine</h2>
        <table className="tableau">
          <thead>
            <tr><th>Jour</th><th>Jours renseignés</th><th>Prévus</th><th>Présents</th><th>Taux</th></tr>
          </thead>
          <tbody>
            {a.par_jour_semaine.map((s) => (
              <tr key={s.jour_semaine} className={s.nb_jours === 0 ? "attenue" : ""}>
                <td>{s.nom}</td><td>{s.nb_jours}</td><td>{s.prevus}</td><td>{s.presents}</td><td><b>{pct(s.taux)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="aide">
          Les estimations utilisent le taux du jour de la semaine dès qu'il y a au moins 2 jours renseignés, sinon le
          taux global.
        </p>
      </section>

      {prochains.length > 0 && (
        <section className="carte">
          <h2>Jours à venir : présents probables</h2>
          <table className="tableau">
            <thead>
              <tr><th>Jour</th><th>Inscrits attendus</th><th>Présents probables</th><th>Repas probables</th></tr>
            </thead>
            <tbody>
              {prochains.map((p) => (
                <tr key={p.jour}>
                  <td>{court(p.jour)}</td><td>{p.prevus}</td><td><b>≈ {p.probables}</b></td><td>≈ {p.repas_probables}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {a.jours.some((j) => j.note) && (
        <section className="carte">
          <h2>Notes des journées</h2>
          <ul className="journal">
            {a.jours.filter((j) => j.note).map((j) => (
              <li key={j.jour}>
                <time>{court(j.jour)}</time>
                <span>{j.note} <small>· {j.saisi_par}</small></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
