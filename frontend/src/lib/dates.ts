import type { Creneau } from "./types";

const JOURS_COURTS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MOIS_COURTS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

/** "2026-11-23" → Date à midi local (évite les décalages de fuseau). */
export function versDate(iso: string): Date {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j, 12);
}

export function versIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const jourSemaine = (iso: string) => versDate(iso).getDay(); // 1 = lundi … 6 = samedi

export function court(iso: string): string {
  const d = versDate(iso);
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

export function long(iso: string): string {
  return versDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function numeroJour(iso: string): string {
  return String(versDate(iso).getDate());
}

/** Lundi de la semaine qui contient la date. */
export function lundi(iso: string): string {
  const d = versDate(iso);
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  return versIso(d);
}

export interface Semaine {
  lundi: string;
  cases: (string | null)[]; // 6 cases lun → sam ; null = hors chantier
}

/** Regroupe les jours ouvrés du chantier en semaines de 6 cases (lun → sam). */
export function semaines(jours: string[]): Semaine[] {
  const ensemble = new Set(jours);
  const resultat = new Map<string, Semaine>();
  for (const j of jours) {
    const l = lundi(j);
    if (!resultat.has(l)) {
      const cases: (string | null)[] = [];
      const d = versDate(l);
      for (let i = 0; i < 6; i++) {
        const iso = versIso(d);
        cases.push(ensemble.has(iso) ? iso : null);
        d.setDate(d.getDate() + 1);
      }
      resultat.set(l, { lundi: l, cases });
    }
  }
  return [...resultat.values()];
}

export const LIBELLE_CRENEAU: Record<Creneau, string> = {
  journee: "Journée",
  matin: "Matin",
  apres_midi: "Après-midi",
};

export const ABREGE_CRENEAU: Record<Creneau, string> = {
  journee: "JOUR",
  matin: "MATIN",
  apres_midi: "A-MIDI",
};

export const ENTETES_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
