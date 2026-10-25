import { Navigate, NavLink, Outlet } from "react-router-dom";
import { LIBELLE_ROLE, useSession } from "../../lib/session";

export default function Layout() {
  const { session, deconnecter, peut } = useSession();
  if (!session) return <Navigate to="/admin/connexion" replace />;
  const equipe = peut("responsable", "adjoint");

  return (
    <div className="admin">
      <header className="admin-entete">
        <div className="marque">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <div>
            <b>Service volontaires</b>
            <small>
              {session.utilisateur.nom} · {LIBELLE_ROLE[session.utilisateur.role]}
            </small>
          </div>
        </div>
        <button className="bouton discret" onClick={deconnecter}>
          Déconnexion
        </button>
      </header>
      <nav className="onglets">
        <NavLink to="/admin" end>Couverture</NavLink>
        {equipe && <NavLink to="/admin/volontaires">Volontaires</NavLink>}
        {equipe && <NavLink to="/admin/journal">Journal</NavLink>}
        <NavLink to="/admin/reglages">Réglages</NavLink>
      </nav>
      <main className="admin-contenu">
        <Outlet />
      </main>
    </div>
  );
}
