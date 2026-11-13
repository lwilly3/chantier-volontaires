import { court, ENTETES_SEMAINE, jourSemaine, numeroJour, semaines, versDate } from "./dates";
import { niveau } from "./couverture";
import type { JourCouverture } from "./types";

// Couleurs fixes (thème clair) : l'image doit rester lisible une fois partagée, quel que soit le thème de l'écran
const FOND = "#ffffff";
const TEXTE = "#1d2a27";
const TEXTE_2 = "#5f6b67";
const PRIMAIRE = [0x1f, 0x4e, 0x46];
const DANGER = [0xb4, 0x38, 0x2e];
const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Rectangle à coins arrondis ; coins droits sur les navigateurs d'avant 2022, qui n'ont pas roundRect. */
function arrondi(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, r: number) {
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, l, h, r);
  else ctx.rect(x, y, l, h);
}

const melange = (c: number[], part: number) =>
  `rgb(${c.map((v) => Math.round(v * part + 255 * (1 - part))).join(",")})`;

/** Dessine la grille compétences × jours dans une image PNG. */
export function imageGrille(
  jours: JourCouverture[], lignes: string[], max: number, exporteLe: Date,
  /** Compétences mises en évidence à l'écran : elles ressortent de la même façon dans l'image. */
  actives: ReadonlySet<string> = new Set(),
): Promise<Blob> {
  const ECH = 2; // netteté sur les écrans de téléphone
  const CASE = 30, PAS = 32, MARGE = 20;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  ctx.font = `600 13px ${POLICE}`;
  const colNoms = Math.ceil(Math.max(...lignes.map((l) => ctx.measureText(l).width))) + 26;
  const hautTitre = 54, hautEntete = 50, hautPied = 62;
  const largeur = Math.max(MARGE * 2 + colNoms + jours.length * PAS, 560);
  const hauteur = MARGE + hautTitre + hautEntete + lignes.length * PAS + hautPied + MARGE - 8;
  canvas.width = largeur * ECH;
  canvas.height = hauteur * ECH;
  ctx.scale(ECH, ECH);
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.textBaseline = "middle";

  // Titre
  ctx.fillStyle = TEXTE;
  ctx.font = `800 18px ${POLICE}`;
  ctx.fillText("Compétences par jour", MARGE, MARGE + 10);
  ctx.fillStyle = TEXTE_2;
  ctx.font = `13px ${POLICE}`;
  // Date et heure de l'export : permet de distinguer une image récente d'une plus ancienne
  const quand = exporteLe.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = exporteLe.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  ctx.fillText(`Volontaires attendus · exporté le ${quand} à ${heure}`, MARGE, MARGE + 34);

  // En-têtes : mois, puis jour de la semaine et numéro
  const x0 = MARGE + colNoms;
  const yEntete = MARGE + hautTitre;
  let moisPrecedent = "";
  jours.forEach((j, i) => {
    const x = x0 + i * PAS;
    const mois = j.jour.slice(0, 7);
    if (mois !== moisPrecedent) {
      moisPrecedent = mois;
      ctx.textAlign = "left";
      ctx.fillStyle = TEXTE_2;
      ctx.font = `700 11px ${POLICE}`;
      ctx.fillText(versDate(j.jour).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).toUpperCase(), x, yEntete + 6);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = TEXTE_2;
    ctx.font = `600 10px ${POLICE}`;
    ctx.fillText(ENTETES_SEMAINE[jourSemaine(j.jour) - 1]?.[0] ?? "", x + CASE / 2, yEntete + 24);
    ctx.fillStyle = TEXTE;
    ctx.font = `700 13px ${POLICE}`;
    ctx.fillText(numeroJour(j.jour), x + CASE / 2, yEntete + 38);
  });

  // Lignes
  const y0 = yEntete + hautEntete;
  lignes.forEach((nom, li) => {
    const y = y0 + li * PAS;
    const active = actives.has(nom);
    // Comme à l'écran : la ligne choisie porte un nom sur fond foncé, les autres sont atténuées
    ctx.globalAlpha = actives.size > 0 && !active ? 0.3 : 1;
    if (active) {
      ctx.fillStyle = melange(PRIMAIRE, 1);
      ctx.beginPath();
      arrondi(ctx, MARGE, y + 2, colNoms - 8, CASE - 4, 6);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = active ? "#ffffff" : TEXTE;
    ctx.font = `600 13px ${POLICE}`;
    ctx.fillText(nom, MARGE + 8, y + CASE / 2);
    jours.forEach((j, i) => {
      const n = j.par_competence[nom] ?? 0;
      const part = n / max;
      const x = x0 + i * PAS;
      ctx.fillStyle = n ? melange(PRIMAIRE, 0.14 + part * 0.76) : melange(DANGER, 0.13);
      ctx.beginPath();
      arrondi(ctx, x, y, CASE, CASE, 6);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = n === 0 ? melange(DANGER, 1) : part > 0.55 ? "#ffffff" : TEXTE;
      ctx.font = `700 13px ${POLICE}`;
      ctx.fillText(String(n), x + CASE / 2, y + CASE / 2 + 1);
    });
    ctx.globalAlpha = 1;
  });

  // Pied : comment lire les chiffres
  const yPied = y0 + lignes.length * PAS + 16;
  ctx.textAlign = "left";
  ctx.fillStyle = TEXTE_2;
  ctx.font = `12px ${POLICE}`;
  ctx.fillText("En rouge : personne ce jour-là. Hors réserve.", MARGE, yPied);
  ctx.fillText("Une personne qui a plusieurs compétences compte dans chacune.", MARGE, yPied + 18);
  ctx.fillText("Une demi-journée compte comme une journée.", MARGE, yPied + 36);

  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Image impossible à créer"))), "image/png"));
}

const NIVEAUX: Record<ReturnType<typeof niveau>, { fond: string; texte: string }> = {
  vide: { fond: "#e7e2d7", texte: TEXTE },
  faible: { fond: melange([0xf2, 0xc4, 0x6b], 0.7), texte: TEXTE },
  ok: { fond: melange([0x8c, 0xc4, 0x9a], 0.65), texte: TEXTE },
  presque: { fond: melange([0xe8, 0x8b, 0x3e], 0.7), texte: TEXTE },
  complet: { fond: melange([0xc7, 0x4b, 0x3f], 0.75), texte: "#ffffff" },
};

/** Dessine le calendrier « Couverture par jour » (semaines lun → sam) dans une image PNG. */
export function imageCalendrier(jours: JourCouverture[], plafond: number, seuil: number, exporteLe: Date): Promise<Blob> {
  const ECH = 2;
  const MARGE = 20, LARG = 118, HAUT = 62, ESP = 6;
  const grille = semaines(jours.map((j) => j.jour));
  const parJour = new Map(jours.map((j) => [j.jour, j]));
  const hautTitre = 54, hautLegende = 34, hautEntete = 22, hautPied = 44;
  const largeur = MARGE * 2 + 6 * LARG + 5 * ESP;
  const y0 = MARGE + hautTitre + hautLegende + hautEntete;
  const hauteur = y0 + grille.length * (HAUT + ESP) + hautPied + MARGE - 8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = largeur * ECH;
  canvas.height = hauteur * ECH;
  ctx.scale(ECH, ECH);
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.textBaseline = "middle";

  // Titre et date d'export
  ctx.fillStyle = TEXTE;
  ctx.font = `800 18px ${POLICE}`;
  ctx.fillText("Couverture par jour", MARGE, MARGE + 10);
  ctx.fillStyle = TEXTE_2;
  ctx.font = `13px ${POLICE}`;
  const quand = exporteLe.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const heure = exporteLe.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  ctx.fillText(`Volontaires inscrits · exporté le ${quand} à ${heure}`, MARGE, MARGE + 34);

  // Légende des couleurs
  let xl = MARGE;
  const yl = MARGE + hautTitre;
  ctx.font = `700 11px ${POLICE}`;
  for (const [n, libelle] of [["vide", "0"], ["faible", "faible"], ["ok", "bon"], ["presque", `≥ ${seuil}`], ["complet", "plein"]] as const) {
    const l = ctx.measureText(libelle).width + 16;
    ctx.fillStyle = NIVEAUX[n].fond;
    ctx.beginPath();
    arrondi(ctx, xl, yl, l, 20, 6);
    ctx.fill();
    ctx.fillStyle = NIVEAUX[n].texte;
    ctx.textAlign = "center";
    ctx.fillText(libelle, xl + l / 2, yl + 11);
    xl += l + 5;
  }

  // Jours de la semaine
  ctx.fillStyle = TEXTE_2;
  ctx.font = `700 11px ${POLICE}`;
  ENTETES_SEMAINE.forEach((n, i) => ctx.fillText(n.toUpperCase(), MARGE + i * (LARG + ESP) + LARG / 2, y0 - 12));

  // Cases
  let premiere = true;
  grille.forEach((s, li) => {
    s.cases.forEach((iso, i) => {
      if (!iso) return;
      const j = parJour.get(iso)!;
      const x = MARGE + i * (LARG + ESP);
      const y = y0 + li * (HAUT + ESP);
      const { fond, texte } = NIVEAUX[niveau(j, plafond)];
      ctx.fillStyle = fond;
      ctx.beginPath();
      arrondi(ctx, x, y, LARG, HAUT, 10);
      ctx.fill();
      ctx.fillStyle = texte;
      ctx.textAlign = "left";
      // Le mois est rappelé sur la première case et à chaque 1er du mois
      const avecMois = premiere || versDate(iso).getDate() === 1;
      premiere = false;
      ctx.globalAlpha = 0.8;
      ctx.font = `600 11px ${POLICE}`;
      ctx.fillText(avecMois ? court(iso).split(" ").slice(1).join(" ") : numeroJour(iso), x + 8, y + 13);
      ctx.globalAlpha = 1;
      ctx.font = `800 20px ${POLICE}`;
      ctx.fillText(String(j.total), x + 8, y + 35);
      if (j.constate) {
        const decalage = ctx.measureText(String(j.total)).width + 7;
        ctx.globalAlpha = 0.75;
        ctx.font = `700 11px ${POLICE}`;
        ctx.fillText(`✓${j.constate.adultes}`, x + 8 + decalage, y + 37);
        ctx.globalAlpha = 1;
      }
      // Jauge de remplissage
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      arrondi(ctx, x + 8, y + HAUT - 11, LARG - 16, 4, 2);
      ctx.fill();
      const part = Math.min(1, j.total / plafond);
      if (part > 0) {
        ctx.fillStyle = texte;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        arrondi(ctx, x + 8, y + HAUT - 11, (LARG - 16) * part, 4, 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  });

  // Pied : comment lire les chiffres
  const yPied = y0 + grille.length * (HAUT + ESP) + 12;
  ctx.textAlign = "left";
  ctx.fillStyle = TEXTE_2;
  ctx.font = `12px ${POLICE}`;
  ctx.fillText(`Grand chiffre : volontaires inscrits ce jour-là, réserve comprise (plafond : ${plafond} par jour).`, MARGE, yPied);
  if (jours.some((j) => j.constate)) ctx.fillText("✓ : présents constatés sur place.", MARGE, yPied + 18);

  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Image impossible à créer"))), "image/png"));
}

/** Sur téléphone : feuille de partage (WhatsApp…). Sinon, ou si le partage de fichiers n'existe pas : téléchargement. */
export async function partagerImage(blob: Blob, nom: string, titre: string): Promise<void> {
  const fichier = new File([blob], nom, { type: "image/png" });
  const tactile = window.matchMedia("(pointer: coarse)").matches;
  if (tactile && navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: titre });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // partage annulé par la personne
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
