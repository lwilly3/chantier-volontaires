import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ChampsVolontaire from "../components/ChampsVolontaire";
import DispoGrid from "../components/DispoGrid";
import LienPersonnel from "../components/LienPersonnel";
import { api, ApiError } from "../lib/api";
import { memoriserMonToken, monToken } from "../lib/liens";
import type { ConfigPublique, ConfigVerrouillee, VolontaireForm, VolontairePublic } from "../lib/types";

export const VIDE: VolontaireForm = {
  nom: "",
  telephone: "",
  assemblee: "",
  competences: [],
  est_mineur: false,
  remarques: "",
  disponibilites: [],
};

export default function Inscription() {
  const [config, setConfig] = useState<ConfigPublique | ConfigVerrouillee | null>(null);
  const [codeAcces, setCodeAcces] = useState(lireCodeAcces);
  const [erreurChargement, setErreurChargement] = useState("");
  const [form, setForm] = useState<VolontaireForm>(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [inscrit, setInscrit] = useState<VolontairePublic | null>(null);
  const dejaInscrit = monToken();
  const [params] = useSearchParams();
  const [recrutement] = useState(() => lireCodeRecrutement(params.get("r")));
  const [recruteur, setRecruteur] = useState("");

  useEffect(() => {
    if (recrutement)
      api<{ prenom: string }>(`/api/public/recruteur/${encodeURIComponent(recrutement)}`)
        .then((r) => setRecruteur(r.prenom))
        .catch(() => {});
  }, [recrutement]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (codeAcces) q.set("code", codeAcces);
    if (recrutement) q.set("r", recrutement);
    api<ConfigPublique | ConfigVerrouillee>(`/api/public/config?${q}`)
      .then((c) => {
        if (!c.acces && codeAcces) memoriserCodeAcces(""); // code changé entre-temps : on redemande
        setConfig(c);
      })
      .catch((e: ApiError) => setErreurChargement(e.message));
  }, [codeAcces, recrutement]);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (!form.assemblee) return setErreur("Choisissez votre assemblée.");
    if (form.disponibilites.length === 0) return setErreur("Sélectionnez au moins un jour de disponibilité.");
    setEnvoi(true);
    try {
      const v = await api<VolontairePublic>("/api/public/inscription", {
        method: "POST",
        json: { ...form, recrutement: recrutement || null, code_acces: codeAcces || null },
      });
      memoriserMonToken(v.token);
      setInscrit(v);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (erreurChargement) return <Ecran><p className="alerte">{erreurChargement}</p></Ecran>;
  if (!config) return <Ecran><p className="chargement">Chargement…</p></Ecran>;
  if (!config.acces) {
    return (
      <EcranCode
        titre={config.nom_chantier}
        dejaInscrit={dejaInscrit}
        onValide={(c) => {
          memoriserCodeAcces(c);
          setCodeAcces(c);
        }}
      />
    );
  }

  if (inscrit) {
    return (
      <Ecran titre={config.nom_chantier}>
        <div className="carte succes">
          <h2>Merci {inscrit.nom.split(" ")[0]} !</h2>
          <p>
            Votre inscription est enregistrée pour <b>{inscrit.disponibilites.length} jour(s)</b>. Le service volontaires
            vous contactera sur WhatsApp avant le chantier.
          </p>
        </div>
        <LienPersonnel token={inscrit.token} nom={inscrit.nom} important />
      </Ecran>
    );
  }

  if (!config.inscriptions_ouvertes) {
    return (
      <Ecran titre={config.nom_chantier}>
        <div className="carte">
          <p>Les inscriptions sont fermées pour le moment. Rapprochez-vous du service volontaires.</p>
        </div>
      </Ecran>
    );
  }

  return (
    <Ecran titre={config.nom_chantier}>
      {dejaInscrit && (
        <div className="carte info">
          Vous êtes déjà inscrit sur ce téléphone. <Link to={`/moi/${dejaInscrit}`}>Modifier mes disponibilités →</Link>
        </div>
      )}
      {recruteur && (
        <div className="carte info recruteur">
          Inscription proposée par <b>{recruteur}</b>. Merci de votre disponibilité !
        </div>
      )}
      {config.message_accueil && <p className="intro">{config.message_accueil}</p>}

      <form onSubmit={envoyer} className="formulaire">
        <section className="carte">
          <h2><span className="etape">1</span> Vos informations</h2>
          <ChampsVolontaire valeur={form} onChange={setForm} assemblees={config.assemblees} competences={config.competences} />
        </section>

        <section className="carte">
          <h2><span className="etape">2</span> Vos disponibilités</h2>
          <DispoGrid
            jours={config.jours}
            valeur={form.disponibilites}
            onChange={(d) => setForm({ ...form, disponibilites: d })}
            remplissage={config.remplissage}
            plafond={config.plafond_jour}
          />
        </section>

        <div className="barre-envoi">
          {erreur && <p className="alerte">{erreur}</p>}
          <button className="bouton principal large" disabled={envoi}>
            {envoi ? "Envoi…" : "Je m'inscris"}
          </button>
        </div>
      </form>
    </Ecran>
  );
}

export function Ecran({ titre, children }: { titre?: string; children: React.ReactNode }) {
  return (
    <div className="public">
      <header className="bandeau">
        <img src="/icon.svg" alt="" width={36} height={36} />
        <div>
          <p className="surtitre">Service volontaires</p>
          <h1>{titre ?? "Chantier de rénovation"}</h1>
        </div>
      </header>
      <main className="contenu">{children}</main>
    </div>
  );
}

/** Le code ?r= est gardé le temps de la visite (au cas où la page est rechargée sans paramètre). */
function lireCodeRecrutement(depuisUrl: string | null): string {
  try {
    if (depuisUrl) sessionStorage.setItem("volontaires.recrutement", depuisUrl);
    return depuisUrl ?? sessionStorage.getItem("volontaires.recrutement") ?? "";
  } catch {
    return depuisUrl ?? "";
  }
}

const CLE_CODE = "volontaires.codeAcces";

function lireCodeAcces(): string {
  try {
    return sessionStorage.getItem(CLE_CODE) ?? "";
  } catch {
    return "";
  }
}

function memoriserCodeAcces(code: string) {
  try {
    if (code) sessionStorage.setItem(CLE_CODE, code);
    else sessionStorage.removeItem(CLE_CODE);
  } catch {
    /* ignoré */
  }
}

function EcranCode({ titre, dejaInscrit, onValide }: { titre: string; dejaInscrit: string | null; onValide: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await api("/api/public/acces", { method: "POST", json: { code } });
      onValide(code);
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Ecran titre={titre}>
      {dejaInscrit && (
        <div className="carte info">
          Vous êtes déjà inscrit sur ce téléphone. <Link to={`/moi/${dejaInscrit}`}>Modifier mes disponibilités →</Link>
        </div>
      )}
      <form className="carte formulaire connexion code-acces" onSubmit={valider}>
        <h2>Code d'accès</h2>
        <p className="aide">
          Saisissez le code qui vous a été communiqué par le service volontaires ou par un frère de votre assemblée.
        </p>
        <label className="champ">
          <span>Code</span>
          <input
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {erreur && <p className="alerte">{erreur}</p>}
        <button className="bouton principal large" disabled={envoi || !code.trim()}>
          {envoi ? "Vérification…" : "Accéder au formulaire"}
        </button>
      </form>
    </Ecran>
  );
}
