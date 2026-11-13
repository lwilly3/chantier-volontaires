import type { JourCouverture } from "./types";

/** Niveau de remplissage d'un jour : même règle pour le calendrier à l'écran et pour son image. */
export function niveau(j: JourCouverture, plafond: number): "vide" | "faible" | "ok" | "presque" | "complet" {
  if (j.statut === "vide") return "vide";
  if (j.statut === "complet") return "complet";
  if (j.statut === "presque") return "presque";
  return j.total < plafond / 2 ? "faible" : "ok";
}
