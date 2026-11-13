import { useState } from "react";
import { court } from "../lib/dates";
import { partagerImage } from "../lib/imageGrille";
import type { JourCouverture } from "../lib/types";

/** Export d'un tableau en image : les jours à venir (aujourd'hui compris), tout le chantier,
 *  ou une période choisie (si `periode`). */
export default function BoutonsExport({
  jours, aujourdhui, prefixe, titre, dessiner, periode,
}: {
  jours: JourCouverture[];
  aujourdhui: string;
  /** Début du nom de fichier, ex. « competences ». */
  prefixe: string;
  titre: string;
  dessiner: (jours: JourCouverture[], exporteLe: Date) => Promise<Blob>;
  /** Propose aussi de choisir un premier et un dernier jour. */
  periode?: boolean;
}) {
  const [erreur, setErreur] = useState(false);
  const aVenir = jours.filter((j) => j.jour >= aujourdhui);
  // Les deux exports ne diffèrent que si le chantier a commencé et n'est pas terminé
  const deuxExports = aVenir.length > 0 && aVenir.length < jours.length;

  // Période par défaut : d'aujourd'hui (ou du premier jour) à la fin du chantier
  const [du, setDu] = useState(() => (aVenir[0] ?? jours[0])?.jour ?? "");
  const [au, setAu] = useState(() => jours[jours.length - 1]?.jour ?? "");
  const choisis = jours.filter((j) => j.jour >= du && j.jour <= au);

  if (jours.length === 0) return null; // dates du chantier pas encore réglées

  const exporter = async (mode: "a-venir" | "tout" | "periode") => {
    setErreur(false);
    try {
      const maintenant = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      // Date et heure dans le nom du fichier : les exports successifs se classent et se distinguent
      const horodatage = `${maintenant.getFullYear()}-${p(maintenant.getMonth() + 1)}-${p(maintenant.getDate())}-${p(maintenant.getHours())}h${p(maintenant.getMinutes())}`;
      const [selection, suffixe] =
        mode === "periode" ? [choisis, `du-${du}-au-${au}`]
        : mode === "tout" || !deuxExports ? [jours, "tout-le-chantier"]
        : [aVenir, "jours-a-venir"];
      const blob = await dessiner(selection, maintenant);
      await partagerImage(blob, `${prefixe}-${suffixe}-export-${horodatage}.png`, titre);
    } catch {
      setErreur(true);
    }
  };

  return (
    <>
      <div className="gc-actions">
        <span className="aide">Exporter en image :</span>
        {deuxExports && <button className="bouton" onClick={() => exporter("a-venir")}>Jours à venir</button>}
        <button className="bouton" onClick={() => exporter("tout")}>Tout le chantier</button>
      </div>
      {periode && (
        <div className="gc-actions gc-periode">
          <label>
            Du
            <select value={du} onChange={(e) => { setDu(e.target.value); if (e.target.value > au) setAu(e.target.value); }}>
              {jours.map((j) => <option key={j.jour} value={j.jour}>{court(j.jour)}</option>)}
            </select>
          </label>
          <label>
            au
            <select value={au} onChange={(e) => { setAu(e.target.value); if (e.target.value < du) setDu(e.target.value); }}>
              {jours.map((j) => <option key={j.jour} value={j.jour}>{court(j.jour)}</option>)}
            </select>
          </label>
          <button className="bouton" onClick={() => exporter("periode")}>
            Exporter cette période ({choisis.length} jour{choisis.length > 1 ? "s" : ""})
          </button>
        </div>
      )}
      {erreur && <p className="alerte">L'image n'a pas pu être créée. Réessaie, ou fais une capture d'écran.</p>}
    </>
  );
}
