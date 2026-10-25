import { Fragment, useMemo } from "react";
import { ABREGE_CRENEAU, court, ENTETES_SEMAINE, jourSemaine, LIBELLE_CRENEAU, numeroJour, semaines, versDate } from "../lib/dates";
import type { Creneau, Dispo, StatutJour } from "../lib/types";

const CYCLE: (Creneau | null)[] = [null, "journee", "matin", "apres_midi"];

/** Mois affiché au-dessus d'une semaine : celui de son dernier jour de chantier. */
function moisDeSemaine(cases: (string | null)[]): string {
  const dernier = [...cases].reverse().find(Boolean)!;
  const m = versDate(dernier).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

interface Props {
  jours: string[];
  valeur: Dispo[];
  onChange: (d: Dispo[]) => void;
  remplissage?: Record<string, { total: number; statut: StatutJour }>;
  plafond?: number;
}

export default function DispoGrid({ jours, valeur, onChange, remplissage, plafond }: Props) {
  const carte = useMemo(() => new Map(valeur.map((d) => [d.jour, d.creneau])), [valeur]);
  const grille = useMemo(() => semaines(jours), [jours]);

  const appliquer = (m: Map<string, Creneau>) =>
    onChange([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([jour, creneau]) => ({ jour, creneau })));

  const basculer = (jour: string) => {
    const m = new Map(carte);
    const suivant = CYCLE[(CYCLE.indexOf(m.get(jour) ?? null) + 1) % CYCLE.length];
    if (suivant) m.set(jour, suivant);
    else m.delete(jour);
    appliquer(m);
  };

  const basculerGroupe = (groupe: string[]) => {
    const m = new Map(carte);
    const tousPris = groupe.every((j) => m.has(j));
    for (const j of groupe) {
      if (tousPris) m.delete(j);
      else if (!m.has(j)) m.set(j, "journee");
    }
    appliquer(m);
  };

  const parJourSemaine = (n: number) => jours.filter((j) => jourSemaine(j) === n);

  return (
    <div className="dispo">
      <p className="aide">
        Touche un jour plusieurs fois pour choisir : <b>journée</b> → <b>matin</b> → <b>après-midi</b> → retirer.
      </p>

      <div className="raccourcis" role="group" aria-label="Raccourcis">
        {ENTETES_SEMAINE.map((nom, i) => {
          const groupe = parJourSemaine(i + 1);
          const actif = groupe.length > 0 && groupe.every((j) => carte.has(j));
          return (
            <button key={nom} type="button" className={`puce ${actif ? "on" : ""}`} onClick={() => basculerGroupe(groupe)}>
              Tous les {nom.toLowerCase()}.
            </button>
          );
        })}
        {valeur.length > 0 && (
          <button type="button" className="puce attenue" onClick={() => onChange([])}>
            Tout effacer
          </button>
        )}
      </div>

      <div className="grille" role="grid">
        <div className="grille-entete" role="row">
          {ENTETES_SEMAINE.map((n) => (
            <span key={n} role="columnheader">{n}</span>
          ))}
          <span aria-hidden />
        </div>
        {grille.map((s, idx) => {
          const presents = s.cases.filter((c): c is string => !!c);
          const semaineComplete = presents.length > 0 && presents.every((j) => carte.has(j));
          const mois = moisDeSemaine(s.cases);
          const afficherMois = idx === 0 || mois !== moisDeSemaine(grille[idx - 1].cases);
          return (
            <Fragment key={s.lundi}>
              {afficherMois && <div className="grille-mois">{mois}</div>}
            <div className="grille-ligne" role="row">
              {s.cases.map((jour, i) => {
                if (!jour) return <span key={i} className="case vide" aria-hidden />;
                const choix = carte.get(jour);
                const r = remplissage?.[jour];
                return (
                  <button
                    key={jour}
                    type="button"
                    role="gridcell"
                    className={`case ${choix ? `pris ${choix}` : ""}`}
                    onClick={() => basculer(jour)}
                    aria-pressed={!!choix}
                    aria-label={`${court(jour)} : ${choix ? LIBELLE_CRENEAU[choix] : "non disponible"}${r ? `, ${r.total} inscrits` : ""}`}
                  >
                    {choix && <span className="creneau">{ABREGE_CRENEAU[choix]}</span>}
                    <span className="num">{numeroJour(jour)}</span>
                    {r && plafond ? (
                      <span className={`charge ${r.statut === "ok" && r.total < plafond / 2 ? "vide" : r.statut}`} title={`${r.total} / ${plafond} inscrits`}>
                        {r.statut === "complet" ? "plein" : r.total}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <button
                type="button"
                className={`semaine ${semaineComplete ? "on" : ""}`}
                onClick={() => basculerGroupe(presents)}
                title="Toute la semaine"
                aria-label={`Toute la semaine du ${court(s.lundi)}`}
              >
                {semaineComplete ? "✓" : "+"}
              </button>
            </div>
            </Fragment>
          );
        })}
      </div>

      {remplissage && plafond ? (
        <p className="legende">
          Sous chaque date : le nombre de volontaires déjà prévus (maximum {plafond} par jour).
          <span className="charge vide">jaune</span> on a besoin de monde
          <span className="charge complet">plein</span> tu seras en réserve
        </p>
      ) : null}

      <p className="total-jours">
        <b>{valeur.length}</b> jour{valeur.length > 1 ? "s" : ""} sélectionné{valeur.length > 1 ? "s" : ""}
      </p>
    </div>
  );
}
