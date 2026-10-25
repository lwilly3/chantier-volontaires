import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/session";
import Inscription from "./pages/Inscription";
import Moi from "./pages/Moi";
import Presences from "./pages/Presences";
import Analyses from "./pages/admin/Analyses";
import Connexion from "./pages/admin/Connexion";
import Couverture from "./pages/admin/Couverture";
import FicheVolontaire from "./pages/admin/FicheVolontaire";
import Jeton from "./pages/admin/Jeton";
import Journal from "./pages/admin/Journal";
import Layout from "./pages/admin/Layout";
import Reglages from "./pages/admin/Reglages";
import Volontaires from "./pages/admin/Volontaires";
import "./styles.css";

function SiEquipe({ children }: { children: React.ReactElement }) {
  const { peut } = useSession();
  return peut("responsable", "adjoint") ? children : <Navigate to="/admin" replace />;
}

function SiGestion({ children }: { children: React.ReactElement }) {
  const { peut } = useSession();
  return peut("responsable", "adjoint", "relais") ? children : <Navigate to="/admin" replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Inscription />} />
          <Route path="/moi/:token" element={<Moi />} />
          <Route path="/presences" element={<Presences />} />
          <Route path="/admin/connexion" element={<Connexion />} />
          <Route path="/admin/invitation/:token" element={<Jeton />} />
          <Route path="/admin/reinitialiser/:token" element={<Jeton />} />
          <Route path="/admin" element={<Layout />}>
            <Route index element={<Couverture />} />
            <Route path="volontaires" element={<SiGestion><Volontaires /></SiGestion>} />
            <Route path="volontaires/:id" element={<SiGestion><FicheVolontaire /></SiGestion>} />
            <Route path="journal" element={<SiEquipe><Journal /></SiEquipe>} />
            <Route path="analyses" element={<Analyses />} />
            <Route path="reglages" element={<Reglages />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>
);
