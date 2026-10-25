export const lienPersonnel = (token: string) => `${window.location.origin}/moi/${token}`;

/** Lien WhatsApp : vers un numéro précis, ou vers le choix de contact si pas de numéro. */
export function lienWhatsApp(texte: string, telephone?: string): string {
  const num = (telephone ?? "").replace(/\D/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(texte)}`;
}

export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

const CLE_TOKEN = "volontaires.monLien";

export function memoriserMonToken(token: string) {
  try {
    localStorage.setItem(CLE_TOKEN, token);
  } catch {
    /* ignoré */
  }
}

export function monToken(): string | null {
  try {
    return localStorage.getItem(CLE_TOKEN);
  } catch {
    return null;
  }
}

export function oublierMonToken() {
  try {
    localStorage.removeItem(CLE_TOKEN);
  } catch {
    /* ignoré */
  }
}
