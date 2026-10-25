/** Espace de démonstration : activé à la construction du site (VITE_DEMO=1, projet Pages séparé). */
export const DEMO = import.meta.env.VITE_DEMO === "1";

// Mêmes valeurs que le serveur de démo (backend/app/demo.py)
export const DEMO_CODE_ACCES = "DEMO";
export const DEMO_MDP_PRESENCES = "demo";

export const DEMO_ROLES = [
  { role: "responsable", libelle: "Responsable", desc: "Tout voir et tout régler" },
  { role: "adjoint", libelle: "Adjoint", desc: "Gérer les volontaires au quotidien" },
  { role: "relais", libelle: "Homme clé", desc: "Recruter et faire les rappels" },
  { role: "cuisine", libelle: "Cuisine", desc: "Effectifs et repas, sans noms" },
  { role: "comite", libelle: "Comité", desc: "Vue d'ensemble, sans noms" },
] as const;
