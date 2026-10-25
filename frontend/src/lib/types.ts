export type Creneau = "journee" | "matin" | "apres_midi";
export type Role = "responsable" | "adjoint" | "cuisine" | "comite";
export type StatutJour = "vide" | "ok" | "presque" | "complet";

export interface Dispo {
  jour: string;
  creneau: Creneau;
}

export interface VolontaireForm {
  nom: string;
  telephone: string;
  assemblee: string;
  competences: string[];
  est_mineur: boolean;
  remarques: string;
  disponibilites: Dispo[];
}

export interface VolontairePublic extends VolontaireForm {
  token: string;
}

export interface VolontaireAdmin extends VolontairePublic {
  id: number;
  source: "public" | "adjoint";
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConfigPublique {
  nom_chantier: string;
  date_debut: string;
  date_fin: string;
  plafond_jour: number;
  inscriptions_ouvertes: boolean;
  message_accueil: string;
  contact_whatsapp: string;
  competences: string[];
  assemblees: string[];
  jours: string[];
  remplissage: Record<string, { total: number; statut: StatutJour }>;
}

export interface JourCouverture {
  jour: string;
  total: number;
  presents: number;
  reserve: number;
  matin: number;
  apres_midi: number;
  journee: number;
  statut: StatutJour;
  par_assemblee: Record<string, number>;
  par_competence: Record<string, number>;
}

export interface Couverture {
  plafond_jour: number;
  seuil_alerte: number;
  jours: JourCouverture[];
  resume: {
    volontaires: number;
    sans_disponibilite: number;
    par_assemblee: Record<string, number>;
    jours_chantier: number;
    jours_vides: number;
    jours_complets: number;
    moyenne_jour: number;
    personnes_jours: number;
  };
}

export interface VolontaireDuJour {
  rang: number;
  en_reserve: boolean;
  creneau: Creneau;
  volontaire_id: number;
  nom: string;
  telephone: string;
  assemblee: string;
  competences: string[];
  est_mineur: boolean;
}

export interface Utilisateur {
  id: number;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
}

export interface Parametres {
  nom_chantier: string;
  date_debut: string;
  date_fin: string;
  plafond_jour: number;
  seuil_alerte: number;
  jours_fermes: string[];
  competences: string[];
  assemblees: string[];
  inscriptions_ouvertes: boolean;
  message_accueil: string;
  contact_whatsapp: string;
}

export interface EntreeJournal {
  id: number;
  date: string;
  acteur: string;
  action: string;
  volontaire_id: number | null;
  volontaire: string | null;
  details: string;
}
