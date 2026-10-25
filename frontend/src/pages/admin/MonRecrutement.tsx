import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { copier, lienWhatsApp } from "../../lib/liens";
import type { MonRecrutement as TMonRecrutement } from "../../lib/types";

/** Lien d'inscription personnel : les volontaires inscrits par ce lien sont rattachés à vous. */
export default function MonRecrutement() {
  const [data, setData] = useState<TMonRecrutement | null>(null);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    api<TMonRecrutement>("/api/admin/mon-recrutement").then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  const message =
    "Bonjour ! La rénovation de notre Salle du Royaume commence bientôt et nous avons besoin de volontaires " +
    `(du lundi au samedi). Indique tes compétences et les jours où tu peux venir ici : ${data.lien}`;

  return (
    <section className="carte">
      <div className="titre-section">
        <h2>Mon lien de recrutement</h2>
        <Link className="badge ok" to="/admin/volontaires?recrute_par=moi">
          {data.nb_recrues} recrue{data.nb_recrues > 1 ? "s" : ""}
        </Link>
      </div>
      <p className="aide">
        Partagez ce lien aux frères et sœurs que vous encouragez à participer : leurs inscriptions vous seront
        rattachées, et vous les retrouverez avec le filtre « Mes recrues ». Les volontaires que vous saisissez
        vous-même comptent aussi.
      </p>
      <code className="lien">{data.lien}</code>
      <div className="actions">
        <a className="bouton whatsapp" href={lienWhatsApp(message)} target="_blank" rel="noreferrer">
          Partager sur WhatsApp
        </a>
        <button
          type="button"
          className="bouton"
          onClick={async () => {
            setCopie(await copier(data.lien));
            setTimeout(() => setCopie(false), 2000);
          }}
        >
          {copie ? "Copié ✓" : "Copier le lien"}
        </button>
      </div>
    </section>
  );
}
