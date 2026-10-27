/** Invitation à rejoindre la communauté WhatsApp du chantier (si le lien est enregistré dans Réglages). */
export default function CarteCommunaute({ lien }: { lien?: string | null }) {
  if (!lien) return null;
  return (
    <div className="carte communaute">
      <h3>📣 Rejoins la communauté WhatsApp du chantier</h3>
      <p>Tu y recevras les annonces : rappels, horaires, changements de programme.</p>
      <a className="bouton whatsapp" href={lien} target="_blank" rel="noreferrer">
        Rejoindre la communauté
      </a>
    </div>
  );
}
