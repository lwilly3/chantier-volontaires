import { useState } from "react";
import { copier, lienPersonnel, lienWhatsApp } from "../lib/liens";

interface Props {
  token: string;
  nom: string;
  telephone?: string; // si fourni : envoi direct au volontaire (côté équipe)
  important?: boolean;
}

export default function LienPersonnel({ token, nom, telephone, important }: Props) {
  const [copie, setCopie] = useState(false);
  const lien = lienPersonnel(token);
  const texte = telephone
    ? `Bonjour ${nom.split(" ")[0]}, voici ton lien personnel pour le chantier de la Salle du Royaume. Il te permet de voir et modifier tes disponibilités : ${lien}`
    : `Mon lien personnel pour le chantier de la Salle du Royaume (modifier mes disponibilités) : ${lien}`;

  return (
    <div className={`carte lien-perso ${important ? "important" : ""}`}>
      <h3>{telephone ? "Lien personnel du volontaire" : "Ton lien personnel"}</h3>
      {important && (
        <p>
          <b>Garde ce lien.</b> Il te permet de modifier tes disponibilités à tout moment. Envoie-le-toi sur
          WhatsApp pour le retrouver facilement.
        </p>
      )}
      <code className="lien">{lien}</code>
      <div className="actions">
        <a className="bouton whatsapp" href={lienWhatsApp(texte, telephone)} target="_blank" rel="noreferrer">
          {telephone ? "Envoyer sur WhatsApp" : "M'envoyer sur WhatsApp"}
        </a>
        <button
          type="button"
          className="bouton"
          onClick={async () => {
            setCopie(await copier(lien));
            setTimeout(() => setCopie(false), 2000);
          }}
        >
          {copie ? "Copié ✓" : "Copier le lien"}
        </button>
      </div>
    </div>
  );
}
