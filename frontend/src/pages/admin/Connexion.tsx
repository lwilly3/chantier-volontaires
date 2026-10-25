import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, ApiError, type Session } from "../../lib/api";
import { DEMO, DEMO_ROLES } from "../../lib/demo";
import { useSession } from "../../lib/session";
import { Ecran } from "../Inscription";

export default function Connexion() {
  const { session, connecter } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [oubliPossible, setOubliPossible] = useState(false);
  const [modeOubli, setModeOubli] = useState(false);
  const [messageOubli, setMessageOubli] = useState("");

  useEffect(() => {
    api<{ mot_de_passe_oublie: boolean }>("/api/auth/options")
      .then((o) => setOubliPossible(o.mot_de_passe_oublie))
      .catch(() => {});
  }, []);

  if (session) return <Navigate to="/admin" replace />;

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      if (modeOubli) {
        const r = await api<{ message: string }>("/api/auth/mot-de-passe-oublie", { method: "POST", json: { email } });
        setMessageOubli(r.message);
      } else {
        const s = await api<Session>("/api/auth/login", { method: "POST", json: { email, password } });
        connecter(s);
        nav("/admin", { replace: true });
      }
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  const entrerDemo = async (role: string) => {
    setErreur("");
    try {
      const s = await api<Session>(`/api/demo/connexion/${role}`, { method: "POST" });
      connecter(s);
      nav("/admin", { replace: true });
    } catch (err) {
      setErreur((err as ApiError).message);
    }
  };

  return (
    <Ecran titre="Espace équipe">
      {DEMO && (
        <div className="carte entree-demo">
          <h2>Essayer avec un rôle</h2>
          <p className="aide">Choisis un rôle pour voir l'application comme le verra la personne concernée.</p>
          <div className="roles-demo">
            {DEMO_ROLES.map((r) => (
              <button key={r.role} type="button" className="bouton" onClick={() => entrerDemo(r.role)}>
                <b>{r.libelle}</b>
                <small>{r.desc}</small>
              </button>
            ))}
          </div>
          {erreur && <p className="alerte">{erreur}</p>}
        </div>
      )}
      {!DEMO && (
      <form className="carte formulaire connexion" onSubmit={envoyer}>
        {modeOubli && <h2>Mot de passe oublié</h2>}
        {modeOubli && !messageOubli && (
          <p className="aide">Indique l'e-mail de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.</p>
        )}
        {messageOubli ? (
          <p className="ok">{messageOubli}</p>
        ) : (
          <>
            <label className="champ">
              <span>E-mail</span>
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {!modeOubli && (
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
            )}
            {erreur && <p className="alerte">{erreur}</p>}
            <button className="bouton principal large" disabled={envoi}>
              {envoi ? "Envoi…" : modeOubli ? "Recevoir le lien" : "Se connecter"}
            </button>
          </>
        )}
        <p className="lien-secondaire">
          {modeOubli ? (
            <button type="button" className="lien-bouton" onClick={() => { setModeOubli(false); setMessageOubli(""); setErreur(""); }}>
              ← Retour à la connexion
            </button>
          ) : oubliPossible ? (
            <button type="button" className="lien-bouton" onClick={() => { setModeOubli(true); setErreur(""); }}>
              Mot de passe oublié ?
            </button>
          ) : (
            <small>Mot de passe oublié ? Demande un lien de réinitialisation au responsable du service.</small>
          )}
        </p>
      </form>
      )}
    </Ecran>
  );
}
