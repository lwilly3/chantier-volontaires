import { useState, type ReactNode } from "react";

const CLE = "volontaires.sectionsOuvertes";

function lire(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? "{}");
  } catch {
    return {};
  }
}

/** Section repliable des Réglages : titre + badge d'état toujours visibles, contenu révélé au clic.
 *  L'état ouvert/fermé est mémorisé sur l'appareil. */
export default function Section({
  id,
  titre,
  resume,
  badge,
  children,
  ouvertParDefaut = false,
}: {
  id: string;
  titre: string;
  resume?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  ouvertParDefaut?: boolean;
}) {
  const [ouvert, setOuvert] = useState(() => lire()[id] ?? ouvertParDefaut);

  const basculer = () => {
    const suivant = !ouvert;
    setOuvert(suivant);
    try {
      localStorage.setItem(CLE, JSON.stringify({ ...lire(), [id]: suivant }));
    } catch {
      /* ignoré */
    }
  };

  return (
    <section className={`carte section-repliable ${ouvert ? "ouverte" : ""}`} id={`reglage-${id}`}>
      <button type="button" className="entete-section" aria-expanded={ouvert} onClick={basculer}>
        <span className="entete-texte">
          <span className="entete-titre">{titre}</span>
          {resume && <small>{resume}</small>}
        </span>
        {badge}
        <span className="chevron" aria-hidden>
          ▾
        </span>
      </button>
      {ouvert && <div className="contenu-section">{children}</div>}
    </section>
  );
}
