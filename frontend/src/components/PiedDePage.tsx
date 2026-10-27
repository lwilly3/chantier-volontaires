import { Link } from "react-router-dom";
import { DEPOT_URL } from "../lib/projet";

/** Pied de page commun : nom de l'application, mentions légales et code source. */
export default function PiedDePage() {
  return (
    <footer className="pied-de-page">
      <span>Volontaires</span>
      <Link to="/mentions-legales">Mentions légales et données personnelles</Link>
      <a href={DEPOT_URL} target="_blank" rel="noreferrer">
        Code source (logiciel libre)
      </a>
    </footer>
  );
}
