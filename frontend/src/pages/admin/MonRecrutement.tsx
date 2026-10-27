import { useEffect, useState } from "react";
import Section from "../../components/Section";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { copier, lienWhatsApp } from "../../lib/liens";
import type { MonRecrutement as TMonRecrutement, Parametres } from "../../lib/types";

/** Lien d'inscription personnel : les volontaires inscrits par ce lien te sont rattachés. */
export default function MonRecrutement() {
  const [data, setData] = useState<TMonRecrutement | null>(null);
  const [copie, setCopie] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    api<TMonRecrutement>("/api/admin/mon-recrutement").then(setData).catch(() => {});
    api<Parametres>("/api/admin/parametres")
      .then((p) => setCode(p.code_acces_actif ? p.code_acces : ""))
      .catch(() => {});
  }, []);

  if (!data) return null;
  const message =
    "Bonjour ! La rénovation de notre Salle du Royaume commence bientôt et nous avons besoin de volontaires " +
    `(du lundi au samedi). Indique tes compétences et les jours où tu peux venir ici : ${data.lien}` +
    (code ? `\nCode d'accès : *${code}*` : "");

  return (
    <Section
      id="recrutement"
      titre="Mon lien de recrutement"
      resume="À partager pour inviter des volontaires"
      badge={<span className="badge ok">{data.nb_recrues} recrue{data.nb_recrues > 1 ? "s" : ""}</span>}
    >
      <p className="aide">
        <Link to="/admin/volontaires?recrute_par=moi">Voir mes recrues →</Link>
      </p>
      <p className="aide">
        Partage ce lien aux frères et sœurs que tu encourages à participer : leurs inscriptions te seront
        rattachées, et tu les retrouveras avec le filtre « Mes recrues ». Les volontaires que tu saisis
        toi-même comptent aussi.
      </p>
      <code className="lien">{data.lien}</code>
      {code && (
        <p className="aide">
          Le formulaire est protégé : le message de partage inclut automatiquement le code d'accès <b>{code}</b>.
        </p>
      )}
      <div className="actions">
        <a className="bouton whatsapp" href={lienWhatsApp(message)} target="_blank" rel="noreferrer">
          Partager sur WhatsApp
        </a>
        <button
          type="button"
          className="bouton"
          onClick={async () => {
            setCopie(await copier(message));
            setTimeout(() => setCopie(false), 2000);
          }}
        >
          {copie ? "Copié ✓" : "Copier le message"}
        </button>
      </div>
    </Section>
  );
}
