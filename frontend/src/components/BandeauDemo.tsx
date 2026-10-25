import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { DEMO } from "../lib/demo";
import { useSession } from "../lib/session";

/** Bandeau affiché sur toutes les pages de l'espace de démonstration. */
export default function BandeauDemo() {
  const { peut } = useSession();
  const [etat, setEtat] = useState("");
  if (!DEMO) return null;

  const remettreAZero = async () => {
    if (!window.confirm("Remettre la démo à zéro ? Toutes les modifications faites par les visiteurs seront effacées.")) return;
    setEtat("…");
    try {
      await api("/api/demo/reinitialiser", { method: "POST" });
      window.location.reload();
    } catch (e) {
      setEtat((e as ApiError).message);
    }
  };

  return (
    <div className="bandeau-demo" role="note">
      <p>
        <b>Démonstration</b> · données fictives, effacées chaque nuit
      </p>
      <nav>
        <Link to="/">Formulaire</Link>
        <Link to="/admin">Équipe</Link>
        <Link to="/presences">Présents</Link>
        {peut("responsable", "adjoint") && (
          <button type="button" onClick={remettreAZero}>
            Remettre à zéro {etat}
          </button>
        )}
      </nav>
    </div>
  );
}
