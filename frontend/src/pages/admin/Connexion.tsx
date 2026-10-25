import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, ApiError, type Session } from "../../lib/api";
import { useSession } from "../../lib/session";
import { Ecran } from "../Inscription";

export default function Connexion() {
  const { session, connecter } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  if (session) return <Navigate to="/admin" replace />;

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const s = await api<Session>("/api/auth/login", { method: "POST", json: { email, password } });
      connecter(s);
      nav("/admin", { replace: true });
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Ecran titre="Espace équipe">
      <form className="carte formulaire connexion" onSubmit={envoyer}>
        <label className="champ">
          <span>E-mail</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="champ">
          <span>Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {erreur && <p className="alerte">{erreur}</p>}
        <button className="bouton principal large" disabled={envoi}>
          {envoi ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </Ecran>
  );
}
