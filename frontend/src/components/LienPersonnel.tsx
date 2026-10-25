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
    ? `Bonjour ${nom.split(" ")[0]}, voici votre lien personnel pour le chantier de la Salle du Royaume. Il permet de voir et modifier vos disponibilités : ${lien}`
    : `Mon lien personnel pour le chantier de la Salle du Royaume (modifier mes disponibilités) : ${lien}`;

  return (
    <div className={`carte lien-perso ${important ? "important" : ""}`}>
      <h3>{telephone ? "Lien personnel du volontaire" : "Votre lien personnel"}</h3>
      {important && (
        <p>
          <b>Gardez ce lien.</b> Il vous permet de modifier vos disponibilités à tout moment. Envoyez-le vous sur
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
