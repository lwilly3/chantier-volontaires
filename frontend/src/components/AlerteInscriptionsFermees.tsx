import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import type { Parametres } from "../lib/types";

/** Avertit l'équipe quand les inscriptions sont fermées ; le responsable peut les rouvrir d'un clic. */
export default function AlerteInscriptionsFermees() {
  const { peut } = useSession();
  const responsable = peut("responsable");
  const [p, setP] = useState<Parametres | null>(null);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (peut("responsable", "adjoint")) api<Parametres>("/api/admin/parametres").then(setP).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p || p.inscriptions_ouvertes) return null;

  const rouvrir = async () => {
    setOccupe(true);
    setErreur("");
    try {
      setP(await api<Parametres>("/api/admin/parametres", { method: "PUT", json: { ...p, inscriptions_ouvertes: true } }));
    } catch (e) {
      setErreur((e as ApiError).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="carte alerte-inscriptions">
      <p>
        <b>Les inscriptions sont fermées.</b> Les volontaires voient « Les inscriptions sont fermées pour le moment » et
        ne peuvent plus s'inscrire (ceux déjà inscrits peuvent toujours modifier leurs jours).
      </p>
      {responsable ? (
        <div className="actions">
          <button type="button" className="bouton principal" disabled={occupe} onClick={rouvrir}>
            {occupe ? "…" : "Rouvrir les inscriptions"}
          </button>
          <Link className="bouton discret" to="/admin/reglages">
            Réglages → Chantier
          </Link>
        </div>
      ) : (
        <p className="aide">Seul le responsable peut les rouvrir.</p>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
    </div>
  );
}
