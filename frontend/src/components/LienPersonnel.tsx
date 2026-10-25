import { useState } from "react";
import { copier, lienPersonnel, lienWhatsApp } from "../lib/liens";

interface Props {
  token: string;
  nom: string;
  telephone?: string; // si fourni : envoi direct au volontaire (côté équipe)
  monNumero?: string; // côté volontaire : son propre numéro, pour s'envoyer le lien dans sa discussion « Moi »
  important?: boolean; // écran de confirmation juste après l'inscription
}

export default function LienPersonnel({ token, nom, telephone, monNumero, important }: Props) {
  const [copie, setCopie] = useState(false);
  const [garde, setGarde] = useState(false);
  const lien = lienPersonnel(token);
  const equipe = Boolean(telephone);
  const texte = equipe
    ? `Bonjour ${nom.split(" ")[0]}, voici ton lien personnel pour le chantier de la Salle du Royaume. Garde-le bien : il te permet de voir et modifier tes jours de disponibilité. Ne le partage pas. ${lien}`
    : `🔑 Mon lien personnel pour le chantier de la Salle du Royaume. À garder : il me permet de voir et modifier mes jours. ${lien}`;

  return (
    <div className={`carte lien-perso ${important ? "important" : ""}`}>
      <h3>{equipe ? "Lien personnel du volontaire" : important ? "🔑 Dernière étape : garde ton lien" : "Ton lien personnel"}</h3>

      {important && (
        <>
          <p>
            Tu n’as ni compte ni mot de passe : <b>ce lien est ta clé</b>. C’est le seul moyen de revenir sur ton
            inscription.
          </p>
          <ul className="usages-lien">
            <li>Ajouter ou retirer un jour si ton programme change</li>
            <li>Te désister d’un jour où tu ne pourras finalement pas venir, pour laisser la place à un autre</li>
            <li>Revoir les jours où tu es attendu</li>
          </ul>
          <p className="aide">
            Le plus simple : envoie-le-toi sur WhatsApp, puis épingle le message pour le retrouver. Ne le partage pas :
            toute personne qui l’a peut modifier ton inscription.
          </p>
        </>
      )}
      {!important && !equipe && (
        <p className="aide">Garde ce lien pour revenir ici modifier tes jours. Ne le partage pas.</p>
      )}

      <code className="lien">{lien}</code>
      <div className="actions">
        <a
          className="bouton whatsapp"
          href={lienWhatsApp(texte, telephone ?? monNumero)}
          target="_blank"
          rel="noreferrer"
          onClick={() => setGarde(true)}
        >
          {equipe ? "Envoyer sur WhatsApp" : "M'envoyer sur WhatsApp"}
        </a>
        <button
          type="button"
          className="bouton"
          onClick={async () => {
            const ok = await copier(lien);
            setCopie(ok);
            if (ok) setGarde(true);
            setTimeout(() => setCopie(false), 2000);
          }}
        >
          {copie ? "Copié ✓" : "Copier le lien"}
        </button>
      </div>

      {important && garde && (
        <p className="ok">
          ✓ Parfait. Vérifie que le message est bien arrivé dans WhatsApp (ou colle le lien dans tes notes).
        </p>
      )}
      {important && (
        <p className="aide">
          Lien perdu ? Demande au responsable du service volontaires ou à un adjoint : ils peuvent te le renvoyer.
        </p>
      )}
    </div>
  );
}
