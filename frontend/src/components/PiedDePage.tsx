import { Link } from "react-router-dom";
import { DEPOT_URL, VERSION, VERSION_URL } from "../lib/projet";

/** Pied de page commun : nom et version de l'application, mentions légales et code source. */
export default function PiedDePage() {
  return (
    <footer className="pied-de-page">
      <span>
        Volontaires{" "}
        <a href={VERSION_URL} target="_blank" rel="noreferrer" title="Notes de cette version">
          v{VERSION}
        </a>
      </span>
      <Link to="/mentions-legales">Mentions légales et données personnelles</Link>
      <a href={DEPOT_URL} target="_blank" rel="noreferrer">
        Code source (logiciel libre)
      </a>
    </footer>
  );
}
