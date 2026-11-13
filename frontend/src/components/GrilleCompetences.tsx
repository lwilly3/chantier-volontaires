import { useEffect, useMemo, useRef, useState } from "react";
import { ENTETES_SEMAINE, jourSemaine, long, numeroJour, versDate } from "../lib/dates";
import { imageGrille } from "../lib/imageGrille";
import BoutonsExport from "./BoutonsExport";
import type { JourCouverture } from "../lib/types";

/** Grille compétences × jours : combien de volontaires attendus (hors réserve) ont chaque compétence.
 *  Aucun besoin n'est défini par compétence : le seul signal sûr est le zéro, mis en évidence. */
export default function GrilleCompetences({
  jours, competences, inscrits, aujourdhui, selection, onSelection,
}: {
  jours: JourCouverture[];
  competences: string[];
  /** État des inscriptions, rappelé en tête de l'image exportée. */
  inscrits: string[];
  aujourdhui: string;
  selection: string | null;
  onSelection: (jour: string) => void;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  // Compétences mises en évidence : un clic sur le nom l'ajoute, un second clic la retire
  const [actives, setActives] = useState<Set<string>>(new Set());
  const basculer = (nom: string) =>
    setActives((avant) => {
      const apres = new Set(avant);
      if (!apres.delete(nom)) apres.add(nom);
      return apres;
    });

  // Lignes : la liste des réglages d'abord (même si personne ne l'a), puis les libellés
  // encore portés par des fiches (« Autre », compétence retirée ou renommée).
  const { lignes, max } = useMemo(() => {
    const connues = new Set(competences);
    const autres = new Set<string>();
    let max = 1;
    for (const j of jours) {
      for (const [c, n] of Object.entries(j.par_competence)) {
        if (!connues.has(c)) autres.add(c);
        if (n > max) max = n;
      }
    }
    return {
      lignes: [
        ...competences.map((nom) => ({ nom, horsListe: false })),
        ...[...autres].sort().map((nom) => ({ nom, horsListe: nom !== "Autre" })),
      ],
      max,
    };
  }, [jours, competences]);

  const mois = useMemo(() => {
    const groupes: { cle: string; nom: string; nb: number }[] = [];
    for (const j of jours) {
      const cle = j.jour.slice(0, 7);
      const dernier = groupes[groupes.length - 1];
      if (dernier?.cle === cle) dernier.nb += 1;
      else groupes.push({ cle, nom: versDate(j.jour).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), nb: 1 });
    }
    return groupes;
  }, [jours]);

  // Amène la colonne du jour sélectionné dans la partie visible, sans faire défiler la page
  useEffect(() => {
    const boite = cadre.current;
    const col = boite?.querySelector<HTMLElement>(`th[data-jour="${selection}"]`);
    const tete = boite?.querySelector<HTMLElement>("tbody th");
    if (!boite || !col || !tete) return;
    const gauche = col.offsetLeft - tete.offsetWidth;
    const visible = boite.clientWidth - tete.offsetWidth;
    if (gauche < boite.scrollLeft || gauche + col.offsetWidth > boite.scrollLeft + visible) {
      boite.scrollLeft = gauche - (visible - col.offsetWidth) / 2;
    }
  }, [selection]);

  if (lignes.length === 0 || jours.length === 0) return null;

  return (
    <section className="carte">
      <div className="titre-section">
        <h2>Compétences par jour</h2>
        <div className="legende-niveaux">
          <span className="niv gc-zero">0 = personne</span>
          <span className="niv gc-leg-peu">peu</span>
          <span className="niv gc-leg-beaucoup">beaucoup</span>
        </div>
      </div>
      <div className="grille-comp" ref={cadre}>
        <table>
          <thead>
            <tr>
              <th className="gc-coin" rowSpan={2} scope="col">Compétence</th>
              {mois.map((m) => (
                <th key={m.cle} colSpan={m.nb} className="gc-mois" scope="colgroup"><span>{m.nom}</span></th>
              ))}
            </tr>
            <tr>
              {jours.map((j) => (
                <th
                  key={j.jour}
                  data-jour={j.jour}
                  scope="col"
                  className={`gc-jour ${selection === j.jour ? "sel" : ""} ${j.jour < aujourdhui ? "passe" : ""}`}
                >
                  <button onClick={() => onSelection(j.jour)} aria-label={long(j.jour)} aria-pressed={selection === j.jour}>
                    <small>{ENTETES_SEMAINE[jourSemaine(j.jour) - 1]?.[0]}</small>
                    {numeroJour(j.jour)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.nom} className={actives.size === 0 ? "" : actives.has(l.nom) ? "active" : "attenuee"}>
                <th scope="row" className={l.horsListe ? "hors-liste" : ""}>
                  <button
                    onClick={() => basculer(l.nom)}
                    aria-pressed={actives.has(l.nom)}
                    title={l.horsListe ? `${l.nom} — n'est plus dans la liste des réglages` : l.nom}
                  >
                    {l.nom}
                  </button>
                </th>
                {jours.map((j) => {
                  const n = j.par_competence[l.nom] ?? 0;
                  const part = n / max;
                  return (
                    <td
                      key={j.jour}
                      className={`${n === 0 ? "gc-zero" : ""} ${part > 0.55 ? "fonce" : ""} ${selection === j.jour ? "sel" : ""} ${j.jour < aujourdhui ? "passe" : ""}`}
                      style={n ? { background: `color-mix(in srgb, var(--primaire) ${Math.round(14 + part * 76)}%, var(--surface))` } : undefined}
                      title={`${l.nom} — ${long(j.jour)} : ${n}`}
                      onClick={() => onSelection(j.jour)}
                    >
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aide">
        Volontaires attendus, hors réserve. Une personne qui a plusieurs compétences compte dans chacune, et une
        demi-journée compte comme une journée. Touche un jour pour voir son détail, ou le nom d'une compétence pour
        mettre sa ligne en évidence.
        {actives.size > 0 && (
          <>
            {" "}
            <button className="gc-reset" onClick={() => setActives(new Set())}>Tout réafficher</button>
          </>
        )}
      </p>
      <BoutonsExport
        jours={jours}
        aujourdhui={aujourdhui}
        prefixe="competences"
        periode
        titre="Compétences par jour"
        dessiner={(js, date) => imageGrille(js, lignes.map((l) => l.nom), max, date, actives, inscrits)}
      />
    </section>
  );
}
