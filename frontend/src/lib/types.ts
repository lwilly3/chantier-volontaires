export type Creneau = "journee" | "matin" | "apres_midi";
export type Role = "responsable" | "adjoint" | "relais" | "cuisine" | "comite";
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
  nb_mineurs: number;
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
  recrute_par_id: number | null;
  recrute_par: string | null;
  created_at: string;
  updated_at: string;
}

/** Réponse quand un code d'accès est exigé et pas encore saisi. */
export interface ConfigVerrouillee {
  nom_chantier: string;
  code_requis: true;
  acces: false;
}

export interface ConfigPublique {
  code_requis: boolean;
  acces: true;
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
  /** Jours antérieurs non modifiables par les volontaires (null : tout est modifiable). */
  jours_figes_avant: string | null;
  remplissage: Record<string, { total: number; statut: StatutJour }>;
}

export interface JourCouverture {
  jour: string;
  total: number;
  presents: number;
  reserve: number;
  mineurs: number;
  occupation: number;
  constate: Constate | null;
  probables: number | null;
  repas_probables: number | null;
  matin: number;
  apres_midi: number;
  journee: number;
  statut: StatutJour;
  par_assemblee: Record<string, number>;
  par_competence: Record<string, number>;
}

export interface Constate {
  adultes: number;
  mineurs: number | null;
  note: string;
  saisi_par: string;
}

export interface Couverture {
  plafond_jour: number;
  seuil_alerte: number;
  compter_mineurs_plafond: boolean;
  taux_presence: number | null;
  aujourdhui: string;
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
  nb_mineurs: number;
}

export interface Utilisateur {
  id: number;
  nom: string;
  email: string | null;
  role: Role;
  actif: boolean;
  statut: "actif" | "invite" | "desactive";
  invitation_expire_at: string | null;
  invitation_expiree: boolean;
  nb_recrues: number;
}

export interface MonRecrutement {
  code: string;
  lien: string;
  nb_recrues: number;
}

export interface LienCompte {
  utilisateur: Utilisateur;
  lien: string;
  expire_at: string;
  email_envoye: boolean;
  erreur_email: string | null;
}

export interface JetonInfo {
  type: "invitation" | "reinitialisation";
  nom: string;
  email: string | null;
  role: Role;
}

export type Fournisseur = "brevo" | "resend" | "gmail" | "autre";

export interface ConfigEmail {
  actif: boolean;
  fournisseur: Fournisseur;
  hote: string;
  port: number;
  securite: "starttls" | "ssl" | "aucune";
  utilisateur: string;
  mot_de_passe_defini: boolean;
  expediteur_email: string;
  expediteur_nom: string;
  dernier_test_ok_at: string | null;
  url_site: string;
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
  code_acces_actif: boolean;
  code_acces: string;
  compter_mineurs_plafond: boolean;
  figer_jours_passes: boolean;
  presences_actif: boolean;
  presences_mdp_defini: boolean;
}

export interface Analyses {
  nb_jours_saisis: number;
  taux_global: number | null;
  total_prevus: number;
  total_presents: number;
  par_jour_semaine: { jour_semaine: number; nom: string; nb_jours: number; prevus: number; presents: number; taux: number | null }[];
  jours: {
    jour: string; prevus: number; presents: number; mineurs_prevus: number; mineurs_presents: number | null;
    taux: number | null; note: string; saisi_par: string;
  }[];
  prochains: { jour: string; prevus: number; mineurs_prevus: number; probables: number | null; repas_probables: number | null }[];
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
