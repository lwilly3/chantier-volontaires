import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { court, long } from "../../lib/dates";
import { copier, lienPersonnel, lienWhatsApp } from "../../lib/liens";
import { DEMO } from "../../lib/demo";
import { useSession } from "../../lib/session";
import type { ConfigPublique, Creneau } from "../../lib/types";

type Cible = "tous" | "jour" | "assemblee" | "recrues" | "hors_dates";
type Reserve = "attendus" | "reserve" | "tous";

interface Destinataire {
  id: number;
  nom: string;
  telephone: string;
  token: string;
  assemblee: string;
  jour: string | null;
  creneau: Creneau | null;
  en_reserve: boolean;
}

const CRENEAU_TEXTE: Record<Creneau, string> = {
  journee: "toute la journée",
  matin: "le matin",
  apres_midi: "l'après-midi",
};

const MODELES: { id: string; titre: string; texte: string }[] = [
  {
    id: "rappel",
    titre: "Rappel de la veille",
    texte:
      "Bonjour {prénom}, petit rappel : tu es attendu(e) au chantier de la Salle du Royaume {jour} ({créneau}). " +
      "Merci de prévenir au plus tôt si tu as un empêchement. Tes jours : {lien}",
  },
  {
    id: "horaire",
    titre: "Changement d'horaire",
    texte:
      "Bonjour {prénom}, changement pour {jour} : l'arrivée sur le chantier est fixée à [HEURE]. Merci de ta compréhension !",
  },
  {
    id: "annulation",
    titre: "Annulation",
    texte:
      "Bonjour {prénom}, le chantier de {jour} est annulé. Nous te tiendrons informé(e) de la suite. Merci pour ta disponibilité !",
  },
  {
    id: "reserve",
    titre: "Tu es en réserve",
    texte:
      "Bonjour {prénom}, {jour} est complet : tu es inscrit(e) en réserve et nous te contacterons si une place se libère. " +
      "Tu peux aussi choisir un autre jour ici : {lien}",
  },
  {
    id: "merci",
    titre: "Remerciement",
    texte: "Bonjour {prénom}, merci pour ta participation au chantier de la Salle du Royaume ! Ton aide est précieuse.",
  },
  {
    id: "dates",
    titre: "Dates changées",
    texte:
      "Bonjour {prénom}, les dates du chantier de la Salle du Royaume ont changé : il aura lieu {dates}. " +
      "Certains de tes jours ne font plus partie du chantier. Vérifie et complète tes jours ici : {lien}",
  },
  {
    id: "communaute",
    titre: "Rejoindre la communauté",
    texte:
      "Bonjour {prénom}, rejoins la communauté WhatsApp du chantier pour recevoir les annonces et les rappels : {communauté}",
  },
];

const CHAMPS = ["{prénom}", "{jour}", "{créneau}", "{lien}", "{dates}", "{communauté}"];

function hacher(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function lireEnvoyes(cle: string): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(cle) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}

function ecrireEnvoyes(cle: string, ids: Set<number>) {
  try {
    localStorage.setItem(cle, JSON.stringify([...ids]));
  } catch {
    /* ignoré */
  }
}

export default function Messages() {
  const { peut } = useSession();
  const equipe = peut("responsable", "adjoint");
  const [params] = useSearchParams();

  const [config, setConfig] = useState<ConfigPublique | null>(null);
  const [cible, setCible] = useState<Cible>(
    equipe ? ((params.get("cible") as Cible) || (params.get("jour") ? "jour" : "tous")) : "recrues"
  );
  const [jour, setJour] = useState(params.get("jour") ?? "");
  const [reserve, setReserve] = useState<Reserve>((params.get("reserve") as Reserve) ?? "attendus");
  const [assemblee, setAssemblee] = useState("");
  const [dest, setDest] = useState<Destinataire[] | null>(null);
  const [texte, setTexte] = useState(
    (params.get("cible") === "hors_dates" ? MODELES.find((m) => m.id === "dates") : MODELES[0])!.texte
  );
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState("");
  const [envoyes, setEnvoyes] = useState<Set<number>>(new Set());
  const [traces, setTraces] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<ConfigPublique>("/api/public/config")
      .then((c) => {
        setConfig(c);
        if (!assemblee && c.assemblees?.length) setAssemblee(c.assemblees[0]);
        if (!jour && c.jours?.length) {
          const auj = new Date().toISOString().slice(0, 10);
          setJour(c.jours.find((j) => j > auj) ?? c.jours[c.jours.length - 1]);
        }
      })
      .catch((e: ApiError) => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requete = useMemo(() => {
    const q = new URLSearchParams({ cible });
    if (cible === "jour") {
      if (!jour) return null;
      q.set("jour", jour);
      q.set("reserve", reserve);
    }
    if (cible === "assemblee") {
      if (!assemblee) return null;
      q.set("assemblee", assemblee);
    }
    return q.toString();
  }, [cible, jour, reserve, assemblee]);

  useEffect(() => {
    if (!requete) return;
    setDest(null);
    setErreur("");
    api<Destinataire[]>(`/api/admin/messages/destinataires?${requete}`)
      .then(setDest)
      .catch((e: ApiError) => setErreur(e.message));
  }, [requete]);

  const libelleCible = useMemo(() => {
    if (cible === "tous") return "Tous les volontaires actifs";
    if (cible === "recrues") return "Mes recrues";
    if (cible === "hors_dates") return "Jours à revoir (dates changées)";
    if (cible === "assemblee") return `Assemblée ${assemblee}`;
    const r = reserve === "attendus" ? "attendus" : reserve === "reserve" ? "en réserve" : "attendus + réserve";
    return `${jour ? court(jour) : "?"} (${r})`;
  }, [cible, assemblee, jour, reserve]);

  const cleCampagne = `volontaires.envois.${hacher(`${requete}|${texte}`)}`;
  useEffect(() => {
    setEnvoyes(lireEnvoyes(cleCampagne));
  }, [cleCampagne]);

  const communaute = config?.lien_communaute ?? "";

  const rendre = (d: Destinataire | null) => {
    const j = d?.jour ?? (cible === "jour" ? jour : null);
    return texte
      .replaceAll("{prénom}", d ? d.nom.split(" ")[0] : "à tous")
      .replaceAll("{jour}", j ? long(j) : "")
      .replaceAll("{créneau}", d?.creneau ? CRENEAU_TEXTE[d.creneau] : "")
      .replaceAll("{lien}", d ? lienPersonnel(d.token) : "ton lien personnel reçu à l'inscription")
      .replaceAll("{communauté}", communaute)
      .replaceAll(
        "{dates}",
        config?.date_debut && config?.date_fin ? `du ${long(config.date_debut)} au ${long(config.date_fin)}` : ""
      )
      .replace(/\(\s*\)/g, "")
      .replace(/ {2,}/g, " ")
      .replace(/ +([.,])/g, "$1")
      .trim();
  };

  const avertissements: string[] = [];
  if (texte.includes("{jour}") && cible !== "jour") avertissements.push("{jour} n'est rempli que pour un message aux volontaires d'un jour.");
  if (texte.includes("{créneau}") && cible !== "jour") avertissements.push("{créneau} n'est rempli que pour un message aux volontaires d'un jour.");
  if (texte.includes("{communauté}") && !communaute) avertissements.push("Aucun lien de communauté n'est enregistré dans Réglages : {communauté} restera vide.");
  if (/\[[A-ZÉ ]+\]/.test(texte)) avertissements.push("Remplace le texte entre crochets, par exemple [HEURE], avant d'envoyer.");

  const tracer = (mode: "individuel" | "groupe") => {
    const cle = `${mode}|${cleCampagne}`;
    if (traces.has(cle)) return;
    setTraces(new Set(traces).add(cle));
    api("/api/admin/messages/journal", {
      method: "POST",
      json: { cible: libelleCible, mode, nombre: dest?.length ?? 0, apercu: texte.slice(0, 120) },
    }).catch(() => {});
  };

  const marquer = (id: number, ok = true) => {
    const s = new Set(envoyes);
    if (ok) s.add(id);
    else s.delete(id);
    setEnvoyes(s);
    ecrireEnvoyes(cleCampagne, s);
  };

  const copierTexte = async (cle: string, valeur: string) => {
    setCopie((await copier(valeur)) ? cle : "");
    setTimeout(() => setCopie(""), 2000);
  };

  const telechargerContacts = () => {
    if (!dest?.length) return;
    const vcf = dest
      .map((d) => ["BEGIN:VCARD", "VERSION:3.0", `FN:${d.nom} (chantier)`, `TEL;TYPE=CELL:${d.telephone}`, "END:VCARD"].join("\r\n"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([vcf], { type: "text/vcard" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `volontaires-${libelleCible.replace(/[^\w]+/g, "-")}.vcf` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const nbEnvoyes = dest ? dest.filter((d) => envoyes.has(d.id)).length : 0;
  const prochain = dest?.find((d) => !envoyes.has(d.id));

  return (
    <div className="messages">
      {DEMO && (
        <p className="astuce-demo">
          Démo : tous les numéros sont fictifs (+999…). WhatsApp s'ouvrira mais signalera un numéro invalide : aucun
          message ne peut partir vers une vraie personne. La publication dans un groupe fonctionne normalement.
        </p>
      )}
      <section className="carte">
        <h2>1. À qui ?</h2>
        {equipe ? (
          <div className="choix-cible" role="radiogroup">
            {(
              [
                ["tous", "Tous les volontaires"],
                ["jour", "Les volontaires d'un jour"],
                ["assemblee", "Une assemblée"],
                ["recrues", "Mes recrues"],
                ["hors_dates", "Jours à revoir (dates changées)"],
              ] as [Cible, string][]
            ).map(([v, l]) => (
              <button key={v} type="button" className={`puce ${cible === v ? "on" : ""}`} onClick={() => setCible(v)}>
                {l}
              </button>
            ))}
          </div>
        ) : (
          <p className="aide">En tant qu'homme clé, tu écris à tes recrues.</p>
        )}

        {cible === "jour" && config && (
          <div className="champs deux">
            <label className="champ">
              <span>Jour</span>
              <select value={jour} onChange={(e) => setJour(e.target.value)}>
                {config.jours.map((j) => (
                  <option key={j} value={j}>{long(j)}</option>
                ))}
              </select>
            </label>
            <label className="champ">
              <span>Qui ce jour-là ?</span>
              <select value={reserve} onChange={(e) => setReserve(e.target.value as Reserve)}>
                <option value="attendus">Les attendus (hors réserve)</option>
                <option value="reserve">Seulement la réserve</option>
                <option value="tous">Attendus et réserve</option>
              </select>
            </label>
          </div>
        )}
        {cible === "assemblee" && config && (
          <label className="champ">
            <span>Assemblée</span>
            <select value={assemblee} onChange={(e) => setAssemblee(e.target.value)}>
              {config.assemblees.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        )}
        <p className="compte-dest">
          {dest === null ? "Chargement…" : <><b>{dest.length}</b> destinataire{dest.length > 1 ? "s" : ""} · {libelleCible}</>}
        </p>
        {erreur && <p className="alerte">{erreur}</p>}
      </section>

      <section className="carte">
        <h2>2. Le message</h2>
        <div className="modeles">
          {MODELES.map((m) => (
            <button key={m.id} type="button" className={`puce ${texte === m.texte ? "on" : ""}`} onClick={() => setTexte(m.texte)}>
              {m.titre}
            </button>
          ))}
        </div>
        <label className="champ">
          <span>Texte <small>(modifiable)</small></span>
          <textarea rows={5} value={texte} onChange={(e) => setTexte(e.target.value)} />
        </label>
        <p className="aide">
          Champs remplis automatiquement pour chaque personne :{" "}
          {CHAMPS.map((c) => (
            <button key={c} type="button" className="puce statique champ-auto" onClick={() => setTexte(`${texte} ${c}`)}>
              {c}
            </button>
          ))}
        </p>
        {avertissements.map((a) => (
          <p key={a} className="avertissement">{a}</p>
        ))}
        {dest && dest.length > 0 && (
          <div className="apercu-message">
            <small>Aperçu pour {dest[0].nom}</small>
            <p>{rendre(dest[0])}</p>
          </div>
        )}
      </section>

      <section className="carte">
        <h2>3. Envoyer</h2>

        <div className="sous-bloc">
          <h3>Dans la communauté ou un groupe</h3>
          <p className="aide">
            Un seul message pour tout le monde : WhatsApp s'ouvre avec le texte, choisis la discussion « Annonces » de la
            communauté (ou un groupe) puis envoie. {"{prénom}"} devient « à tous » et {"{lien}"} renvoie au lien
            personnel de chacun.
          </p>
          <div className="apercu-message"><p>{rendre(null)}</p></div>
          <div className="actions">
            <a className="bouton whatsapp" href={lienWhatsApp(rendre(null))} target="_blank" rel="noreferrer" onClick={() => tracer("groupe")}>
              Publier dans WhatsApp
            </a>
            <button type="button" className="bouton" onClick={() => { copierTexte("groupe", rendre(null)); tracer("groupe"); }}>
              {copie === "groupe" ? "Copié ✓" : "Copier le message"}
            </button>
            {communaute && (
              <a className="bouton discret" href={communaute} target="_blank" rel="noreferrer">
                Ouvrir la communauté
              </a>
            )}
          </div>
        </div>

        <div className="sous-bloc">
          <div className="titre-section">
            <h3>Un par un, message personnalisé</h3>
            {dest && dest.length > 0 && (
              <span className={`badge ${nbEnvoyes === dest.length ? "ok" : "presque"}`}>
                {nbEnvoyes} / {dest.length} envoyé{nbEnvoyes > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="aide">
            Touche « Envoyer » : WhatsApp s'ouvre sur la discussion de la personne avec son message. Envoie-le, reviens
            ici, puis passe au suivant. La liste retient qui a déjà reçu ce message sur cet appareil.
          </p>
          {dest && dest.length > 0 && (
            <div className="actions">
              {prochain && (
                <a
                  className="bouton whatsapp"
                  href={lienWhatsApp(rendre(prochain), prochain.telephone)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => { tracer("individuel"); marquer(prochain.id); }}
                >
                  Envoyer au suivant : {prochain.nom.split(" ")[0]}
                </a>
              )}
              <button type="button" className="bouton" onClick={() => copierTexte("numeros", dest.map((d) => d.telephone).join("\n"))}>
                {copie === "numeros" ? "Copié ✓" : "Copier les numéros"}
              </button>
              <button type="button" className="bouton" onClick={telechargerContacts}>
                Contacts (.vcf)
              </button>
              {nbEnvoyes > 0 && (
                <button type="button" className="bouton discret" onClick={() => { setEnvoyes(new Set()); ecrireEnvoyes(cleCampagne, new Set()); }}>
                  Tout remettre à « à envoyer »
                </button>
              )}
            </div>
          )}
          {dest && dest.length === 0 && <p className="vide-msg">Aucun destinataire pour ce choix.</p>}
          {dest && dest.length > 0 && (
            <ul className="liste-envoi">
              {dest.map((d) => {
                const fait = envoyes.has(d.id);
                return (
                  <li key={d.id} className={fait ? "fait" : ""}>
                    <div>
                      <b>{d.nom}</b>
                      <small>
                        {d.telephone}
                        {d.creneau ? ` · ${CRENEAU_TEXTE[d.creneau]}` : ""}
                        {d.en_reserve ? " · réserve" : ""}
                      </small>
                    </div>
                    {fait ? (
                      <button type="button" className="bouton petit discret" onClick={() => marquer(d.id, false)} title="Marquer à envoyer">
                        ✓ Envoyé
                      </button>
                    ) : (
                      <a
                        className="bouton petit whatsapp"
                        href={lienWhatsApp(rendre(d), d.telephone)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => { tracer("individuel"); marquer(d.id); }}
                      >
                        Envoyer
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="aide">
            Astuce : avec « Contacts (.vcf) » tu importes ces numéros dans ton téléphone, puis tu les ajoutes d'un coup à un
            groupe ou une liste de diffusion WhatsApp.
          </p>
        </div>
      </section>
    </div>
  );
}
