import { Fragment, useEffect, useMemo, useState } from "react";
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
  /** Seuil à partir duquel un jour est « presque plein » (à défaut : le plafond). */
  seuil?: number;
  /** Jours antérieurs à cette date (AAAA-MM-JJ) : affichés mais non modifiables. */
  figeAvant?: string | null;
}

export default function DispoGrid({ jours, valeur, onChange, remplissage, plafond, seuil, figeAvant }: Props) {
  const fige = (jour: string) => !!figeAvant && jour < figeAvant;
  const carte = useMemo(() => new Map(valeur.map((d) => [d.jour, d.creneau])), [valeur]);
  const grille = useMemo(() => semaines(jours), [jours]);
  // Jours choisis autrefois mais qui ne font plus partie du chantier (dates modifiées dans les réglages)
  const horsChantier = useMemo(() => {
    const ensemble = new Set(jours);
    return valeur.filter((d) => !ensemble.has(d.jour));
  }, [jours, valeur]);
  const nbChoisis = valeur.length - horsChantier.length;

  const appliquer = (m: Map<string, Creneau>) =>
    onChange([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([jour, creneau]) => ({ jour, creneau })));

  const [dernier, setDernier] = useState<{ jour: string; creneau: Creneau | null; n: number } | null>(null);

  const basculer = (jour: string) => {
    if (fige(jour)) return;
    const m = new Map(carte);
    const suivant = CYCLE[(CYCLE.indexOf(m.get(jour) ?? null) + 1) % CYCLE.length];
    if (suivant) m.set(jour, suivant);
    else m.delete(jour);
    setDernier({ jour, creneau: suivant, n: (dernier?.n ?? 0) + 1 });
    appliquer(m);
  };

  // La bulle disparaît seule après quelques secondes
  useEffect(() => {
    if (!dernier) return;
    const t = setTimeout(() => setDernier(null), 4500);
    return () => clearTimeout(t);
  }, [dernier]);

  const basculerGroupe = (tous: string[]) => {
    const groupe = tous.filter((j) => !fige(j));
    if (groupe.length === 0) return;
    const m = new Map(carte);
    const tousPris = groupe.every((j) => m.has(j));
    for (const j of groupe) {
      if (tousPris) m.delete(j);
      else if (!m.has(j)) m.set(j, "journee");
    }
    appliquer(m);
  };

  const parJourSemaine = (n: number) => jours.filter((j) => jourSemaine(j) === n && !fige(j));

  return (
    <div className="dispo">
      <ModeEmploi avecRemplissage={Boolean(remplissage && plafond)} plafond={plafond} seuil={seuil} avecFige={Boolean(figeAvant)} />

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
        {valeur.some((d) => !fige(d.jour)) && (
          <button type="button" className="puce attenue" onClick={() => onChange(valeur.filter((d) => fige(d.jour)))}>
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
          const presents = s.cases.filter((c): c is string => !!c && !fige(c));
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
                const passe = fige(jour);
                return (
                  <button
                    key={jour}
                    type="button"
                    role="gridcell"
                    className={`case ${choix ? `pris ${choix}` : ""} ${passe ? "fige" : ""}`}
                    onClick={() => basculer(jour)}
                    disabled={passe}
                    aria-pressed={!!choix}
                    aria-label={`${court(jour)} : ${choix ? LIBELLE_CRENEAU[choix] : "non disponible"}${passe ? " (jour passé, non modifiable)" : r ? `, ${r.total} inscrits` : ""}`}
                  >
                    {choix && <span className="creneau">{ABREGE_CRENEAU[choix]}</span>}
                    <span className="num">{numeroJour(jour)}</span>
                    {passe ? (
                      <span className="cadenas" aria-hidden>🔒</span>
                    ) : r && plafond ? (
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
                disabled={presents.length === 0}
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

      <div className="retour-choix" aria-live="polite">
        {dernier && <p key={dernier.n}>{retourChoix(dernier.jour, dernier.creneau)}</p>}
      </div>

      {horsChantier.length > 0 && (
        <p className="avertissement">
          {horsChantier.length === 1 ? "1 jour choisi auparavant ne fait" : `${horsChantier.length} jours choisis auparavant ne font`}{" "}
          plus partie du chantier (les dates ont changé) : {horsChantier.map((d) => court(d.jour)).join(", ")}.{" "}
          {horsChantier.length === 1 ? "Il sera retiré" : "Ils seront retirés"} à l'enregistrement.
        </p>
      )}
      <p className="total-jours">
        <b>{nbChoisis}</b> jour{nbChoisis > 1 ? "s" : ""} sélectionné{nbChoisis > 1 ? "s" : ""}
      </p>
    </div>
  );
}

const PROCHAIN: Record<Creneau, string> = {
  journee: "le matin seulement",
  matin: "l'après-midi seulement",
  apres_midi: "retirer ce jour",
};

function retourChoix(jour: string, creneau: Creneau | null) {
  if (!creneau) return <>{court(jour)} : retiré. Touche-le de nouveau pour le reprendre.</>;
  const quand = creneau === "journee" ? "toute la journée" : creneau === "matin" ? "le matin seulement" : "l'après-midi seulement";
  return (
    <>
      <b>{court(jour)}</b> : {quand}. Touche encore pour {PROCHAIN[creneau]}.
    </>
  );
}

const CLE_GUIDE = "volontaires.guideGrilleFerme";

/** « 0–24 », ou « 7 » quand la plage ne contient qu'un nombre. */
const plage = (de: number, a: number) => (de === a ? `${de}` : `${de}–${a}`);

function ModeEmploi({ avecRemplissage, plafond = 0, seuil, avecFige }: { avecRemplissage: boolean; plafond?: number; seuil?: number; avecFige: boolean }) {
  // Mêmes règles que les pastilles de la grille : jaune sous la moitié du plafond, orange dès le seuil d'alerte
  const alerte = Math.min(seuil ?? plafond, plafond);
  const moitie = Math.ceil(plafond / 2);
  const finPeu = Math.min(moitie, alerte) - 1;
  const [ouvert, setOuvert] = useState(() => {
    try {
      return localStorage.getItem(CLE_GUIDE) !== "1";
    } catch {
      return true;
    }
  });
  const basculer = () => {
    const suivant = !ouvert;
    setOuvert(suivant);
    try {
      localStorage.setItem(CLE_GUIDE, suivant ? "0" : "1");
    } catch {
      /* ignoré */
    }
  };

  if (!ouvert) {
    return (
      <button type="button" className="guide-ferme" onClick={basculer}>
        ? Comment choisir mes jours
      </button>
    );
  }

  return (
    <div className="guide-grille">
      <div className="guide-titre">
        <b>Comment choisir tes jours</b>
        <button type="button" className="lien-discret" onClick={basculer}>
          J'ai compris
        </button>
      </div>
      <p>Touche un jour. Touche-le encore pour préciser :</p>
      <ol className="guide-cycle">
        <li>
          <span className="mini pris journee">JOUR</span>
          <span>1 fois : toute la journée</span>
        </li>
        <li>
          <span className="mini pris matin">MATIN</span>
          <span>2 fois : le matin</span>
        </li>
        <li>
          <span className="mini pris apres_midi">A-MIDI</span>
          <span>3 fois : l'après-midi</span>
        </li>
        <li>
          <span className="mini" />
          <span>4 fois : retiré</span>
        </li>
      </ol>
      <p>
        <span className="mini-plus">+</span> au bout d'une ligne : toute la semaine d'un coup.
      </p>
      {avecFige && <p>🔒 Les jours passés sont grisés : ils ne peuvent plus être modifiés.</p>}
      {avecRemplissage && (
        <>
          <p>La pastille sous la date indique combien de volontaires sont déjà prévus ce jour-là (maximum {plafond}) :</p>
          <ul className="guide-pastilles">
            {finPeu >= 0 && (
              <li>
                <span className="charge vide">{plage(0, finPeu)}</span> encore peu de monde : on a besoin de toi
              </li>
            )}
            {moitie < alerte && (
              <li>
                <span className="charge">{plage(moitie, alerte - 1)}</span> ça se remplit
              </li>
            )}
            {alerte < plafond && (
              <li>
                <span className="charge presque">{plage(alerte, plafond - 1)}</span> presque plein
              </li>
            )}
            <li>
              <span className="charge complet">plein</span> tu seras en réserve, appelé en cas de désistement
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
