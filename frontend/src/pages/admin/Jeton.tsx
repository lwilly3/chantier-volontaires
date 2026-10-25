import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Session } from "../../lib/api";
import { LIBELLE_ROLE, useSession } from "../../lib/session";
import type { JetonInfo } from "../../lib/types";
import { Ecran } from "../Inscription";

/** Page ouverte depuis un lien d'invitation ou de réinitialisation. */
export default function Jeton() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const { connecter, deconnecter } = useSession();
  const [info, setInfo] = useState<JetonInfo | null>(null);
  const [erreurLien, setErreurLien] = useState("");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api<JetonInfo>(`/api/auth/jeton/${token}`)
      .then((i) => {
        setInfo(i);
        setEmail(i.email ?? "");
      })
      .catch((e: ApiError) => setErreurLien(e.message));
  }, [token]);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (mdp.length < 8) return setErreur("Le mot de passe doit faire au moins 8 caractères.");
    if (mdp !== mdp2) return setErreur("Les deux mots de passe ne sont pas identiques.");
    setEnvoi(true);
    try {
      deconnecter(); // une éventuelle autre session ouverte sur ce navigateur
      const s = await api<Session>(`/api/auth/jeton/${token}`, {
        method: "POST",
        json: { password: mdp, email: info?.type === "invitation" ? email : null },
      });
      connecter(s);
      nav("/admin", { replace: true });
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (erreurLien) {
    return (
      <Ecran titre="Espace équipe">
        <div className="carte">
          <p className="alerte">{erreurLien}</p>
          <p>
            <Link to="/admin/connexion">Aller à la page de connexion</Link>
          </p>
        </div>
      </Ecran>
    );
  }
  if (!info) return <Ecran titre="Espace équipe"><p className="chargement">Chargement…</p></Ecran>;

  const invitation = info.type === "invitation";
  const prenom = info.nom.split(" ")[0];

  return (
    <Ecran titre="Espace équipe">
      <form className="carte formulaire connexion" onSubmit={valider}>
        <h2>{invitation ? `Bienvenue ${prenom} !` : `Nouveau mot de passe`}</h2>
        <p className="aide">
          {invitation ? (
            <>
              Tu es invité à rejoindre l'espace équipe du service volontaires avec le rôle{" "}
              <b>{LIBELLE_ROLE[info.role]}</b>. Choisis ton mot de passe pour activer ton compte.
            </>
          ) : (
            <>Choisis un nouveau mot de passe pour le compte de {info.nom}.</>
          )}
        </p>
        <label className="champ">
          <span>E-mail {invitation && <small>(ton identifiant de connexion)</small>}</span>
          <input
            type="email"
            autoComplete="username"
            required={invitation}
            readOnly={!invitation}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="champ">
          <span>Mot de passe <small>(8 caractères minimum)</small></span>
          <input type="password" autoComplete="new-password" minLength={8} required value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </label>
        <label className="champ">
          <span>Confirme le mot de passe</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={mdp2} onChange={(e) => setMdp2(e.target.value)} />
        </label>
        {erreur && <p className="alerte">{erreur}</p>}
        <button className="bouton principal large" disabled={envoi}>
          {envoi ? "Enregistrement…" : invitation ? "Activer mon compte" : "Enregistrer le mot de passe"}
        </button>
      </form>
    </Ecran>
  );
}
