import { Link } from "react-router-dom";

/** Pied de page commun : nom de l'application et lien vers les mentions légales. */
export default function PiedDePage() {
  return (
    <footer className="pied-de-page">
      <span>Volontaires</span>
      <Link to="/mentions-legales">Mentions légales et données personnelles</Link>
    </footer>
  );
}
