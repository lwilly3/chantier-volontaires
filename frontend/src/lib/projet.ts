/** Adresse du code source affichée dans l'application.
 *  Une équipe qui réutilise le projet peut indiquer sa propre copie avec VITE_DEPOT_URL. */
export const DEPOT_URL = (import.meta.env.VITE_DEPOT_URL as string | undefined) || "https://github.com/lwilly3/chantier-volontaires";
export const DEPOT_ORIGINE = "https://github.com/lwilly3/chantier-volontaires";

declare const __APP_VERSION__: string;
/** Numéro de version de l'application, injecté au build depuis package.json. */
export const VERSION = __APP_VERSION__;
/** Page de la version sur le dépôt : notes de version et téléchargement du code. */
export const VERSION_URL = `${DEPOT_URL}/releases/tag/v${VERSION}`;
