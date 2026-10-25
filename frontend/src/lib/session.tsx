import { createContext, useContext, useState, type ReactNode } from "react";
import { ecrireSession, lireSession, type Session } from "./api";
import type { Role } from "./types";

interface Ctx {
  session: Session | null;
  connecter: (s: Session) => void;
  deconnecter: () => void;
  peut: (...roles: Role[]) => boolean;
}

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(lireSession);
  const valeur: Ctx = {
    session,
    connecter: (s) => {
      ecrireSession(s);
      setSession(s);
    },
    deconnecter: () => {
      ecrireSession(null);
      setSession(null);
    },
    peut: (...roles) => !!session && roles.includes(session.utilisateur.role),
  };
  return <SessionCtx.Provider value={valeur}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("SessionProvider manquant");
  return c;
}

export const LIBELLE_ROLE: Record<Role, string> = {
  responsable: "Responsable",
  adjoint: "Adjoint",
  cuisine: "Cuisine",
  comite: "Comité",
};
