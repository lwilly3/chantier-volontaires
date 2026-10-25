import type { Utilisateur } from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const CLE_SESSION = "volontaires.session";

export interface Session {
  token: string;
  utilisateur: Utilisateur;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function lireSession(): Session | null {
  try {
    const brut = localStorage.getItem(CLE_SESSION);
    return brut ? (JSON.parse(brut) as Session) : null;
  } catch {
    return null;
  }
}

export function ecrireSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(CLE_SESSION, JSON.stringify(s));
    else localStorage.removeItem(CLE_SESSION);
  } catch {
    /* stockage indisponible (navigation privée) : la session reste en mémoire */
  }
}

function messageErreur(status: number, corps: unknown): string {
  const detail = (corps as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const champ = detail[0].loc?.slice(-1)[0];
    return champ ? `Champ « ${champ} » invalide` : "Données invalides";
  }
  if (status === 0) return "Pas de connexion au serveur. Vérifiez votre réseau.";
  return `Erreur ${status}`;
}

export async function api<T>(chemin: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...reste } = options;
  const session = lireSession();
  let res: Response;
  try {
    res = await fetch(`${BASE}${chemin}`, {
      ...reste,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session && (!chemin.startsWith("/api/public") || chemin.startsWith("/api/public/config")) && chemin !== "/api/auth/login"
          ? { Authorization: `Bearer ${session.token}` }
          : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : reste.body,
    });
  } catch {
    throw new ApiError(0, messageErreur(0, null));
  }
  if (res.status === 401 && chemin.startsWith("/api/admin")) {
    ecrireSession(null);
    window.location.assign("/admin/connexion");
  }
  if (!res.ok) {
    const corps = await res.json().catch(() => null);
    throw new ApiError(res.status, messageErreur(res.status, corps));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function telecharger(chemin: string, nomFichier: string) {
  const session = lireSession();
  const res = await fetch(`${BASE}${chemin}`, {
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, "Téléchargement impossible");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: nomFichier });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
