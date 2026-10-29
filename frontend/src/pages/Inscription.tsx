import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ChampsVolontaire from "../components/ChampsVolontaire";
import DispoGrid from "../components/DispoGrid";
import CarteCommunaute from "../components/CarteCommunaute";
import PiedDePage from "../components/PiedDePage";
import { useSession } from "../lib/session";
import LienPersonnel from "../components/LienPersonnel";
import { api, ApiError } from "../lib/api";
import { DEMO, DEMO_CODE_ACCES } from "../lib/demo";
import { memoriserMonToken, monToken, oublierMonToken } from "../lib/liens";
import type { ConfigPublique, ConfigVerrouillee, VolontaireForm, VolontairePublic } from "../lib/types";

export const VIDE: VolontaireForm = {
  nom: "",
  telephone: "",
  assemblee: "",
  competences: [],
  est_mineur: false,
  nb_mineurs: 0,
  remarques: "",
  disponibilites: [],
};

export default function Inscription() {
  const [config, setConfig] = useState<ConfigPublique | ConfigVerrouillee | null>(null);
  const [codeAcces, setCodeAcces] = useState(lireCodeAcces);
  const [majeur, setMajeur] = useState(false);
  const [accord, setAccord] = useState(false);
  const [erreurChargement, setErreurChargement] = useState("");
  const [form, setForm] = useState<VolontaireForm>(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [inscrit, setInscrit] = useState<VolontairePublic | null>(null);
  const [dejaInscrit, setDejaInscrit] = useState(monToken);
  const [params] = useSearchParams();
  // Lien de recrutement (?r=) : sert seulement à rattacher l'inscription, n'ouvre pas l'accès
  const recrutement = params.get("r") ?? "";

  useEffect(() => {
    const q = new URLSearchParams();
    if (codeAcces) q.set("code", codeAcces);
    api<ConfigPublique | ConfigVerrouillee>(`/api/public/config?${q}`, { anonyme: true })
      .then((c) => {
        if (!c.acces && codeAcces) memoriserCodeAcces(""); // code changé entre-temps : on redemande
        setConfig(c);
      })
      .catch((e: ApiError) => setErreurChargement(e.message));
  }, [codeAcces]);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (!form.assemblee) return setErreur("Choisis ton assemblée.");
    if (form.disponibilites.length === 0) return setErreur("Sélectionne au moins un jour de disponibilité.");
    if (!majeur) return setErreur("Confirme que tu as 18 ans ou plus pour t'inscrire.");
    if (!accord) return setErreur("Accepte l'utilisation de tes informations pour l'organisation du chantier.");
    setEnvoi(true);
    try {
      const v = await api<VolontairePublic>("/api/public/inscription", {
        method: "POST",
        json: { ...form, recrutement: recrutement || null, code_acces: codeAcces || null, majeur_confirme: majeur, consentement: accord },
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
        onOublier={() => {
          oublierMonToken();
          setDejaInscrit(null);
        }}
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
            Ton inscription est enregistrée pour <b>{inscrit.disponibilites.length} jour(s)</b>. Le service volontaires
            te contactera sur WhatsApp avant le chantier.
          </p>
        </div>
        <LienPersonnel token={inscrit.token} nom={inscrit.nom} monNumero={inscrit.telephone} important />
        {"lien_communaute" in config && <CarteCommunaute lien={config.lien_communaute} />}
      </Ecran>
    );
  }

  if (!config.inscriptions_ouvertes) {
    return (
      <Ecran titre={config.nom_chantier}>
        <div className="carte">
          <p>Les inscriptions sont fermées pour le moment. Rapproche-toi du service volontaires.</p>
        </div>
      </Ecran>
    );
  }

  return (
    <Ecran titre={config.nom_chantier}>
      <NoteEquipe />
      {dejaInscrit && (
        <BandeauDejaInscrit
          token={dejaInscrit}
          onOublier={() => {
            oublierMonToken();
            setDejaInscrit(null);
          }}
        />
      )}
      {config.message_accueil && <p className="intro">{config.message_accueil}</p>}

      <form onSubmit={envoyer} className="formulaire">
        <section className="carte">
          <h2><span className="etape">1</span> Tes informations</h2>
          <ChampsVolontaire valeur={form} onChange={setForm} assemblees={config.assemblees} competences={config.competences} />
        </section>

        <section className="carte">
          <h2><span className="etape">2</span> Tes disponibilités</h2>
          <DispoGrid
            jours={config.jours}
            valeur={form.disponibilites}
            onChange={(d) => setForm({ ...form, disponibilites: d })}
            remplissage={config.remplissage}
            plafond={config.plafond_jour}
            figeAvant={config.jours_figes_avant}
          />
        </section>

        <section className="carte majorite">
          <label className="case-a-cocher">
            <input type="checkbox" checked={majeur} onChange={(e) => setMajeur(e.target.checked)} />
            <span>
              <b>J'ai 18 ans ou plus.</b>
              <small>
                {" "}Les mineurs ne s'inscrivent pas eux-mêmes : ils peuvent venir accompagnés de leur parent ou tuteur,
                qui l'indique dans son inscription.
              </small>
            </span>
          </label>
          <label className="case-a-cocher">
            <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} />
            <span>
              <b>J'accepte que mes informations soient utilisées par le service volontaires pour l'organisation du chantier.</b>
              <small>
                {" "}Elles ne servent à rien d'autre et seront effacées à la fin du chantier.{" "}
                <Link to="/mentions-legales" target="_blank" rel="noopener">
                  Lire les mentions légales
                </Link>
              </small>
            </span>
          </label>
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
      <PiedDePage />
    </div>
  );
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

function EcranCode({
  titre,
  dejaInscrit,
  onOublier,
  onValide,
}: {
  titre: string;
  dejaInscrit: string | null;
  onOublier: () => void;
  onValide: (code: string) => void;
}) {
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
      <NoteEquipe />
      {dejaInscrit && (
        <BandeauDejaInscrit
          token={dejaInscrit}
          onOublier={onOublier}
        />
      )}
      <form className="carte formulaire connexion code-acces" onSubmit={valider}>
        <h2>Code d'accès</h2>
        <p className="aide">
          Saisis le code qui t'a été communiqué par le service volontaires ou par un frère de ton assemblée.
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
        {DEMO && (
          <p className="astuce-demo">
            Démo : le code est <b>{DEMO_CODE_ACCES}</b>.{" "}
            <button type="button" className="lien-bouton" onClick={() => setCode(DEMO_CODE_ACCES)}>
              Le saisir pour moi
            </button>
          </p>
        )}
        {erreur && <p className="alerte">{erreur}</p>}
        <button className="bouton principal large" disabled={envoi || !code.trim()}>
          {envoi ? "Vérification…" : "Accéder au formulaire"}
        </button>
      </form>
    </Ecran>
  );
}

function BandeauDejaInscrit({ token, onOublier }: { token: string; onOublier: () => void }) {
  return (
    <div className="carte info deja-inscrit">
      <p>
        Tu es déjà inscrit sur ce téléphone. <Link to={`/moi/${token}`}>Modifier mes disponibilités →</Link>
      </p>
      <button type="button" className="lien-discret" onClick={onOublier}>
        Ce n'est pas moi
      </button>
    </div>
  );
}

/** Membre de l'équipe connecté sur ce navigateur : le formulaire public se comporte comme pour un volontaire. */
function NoteEquipe() {
  const { session } = useSession();
  if (!session) return null;
  return (
    <p className="carte note-equipe">
      Tu es connecté à l'espace équipe ({session.utilisateur.nom}). Ce formulaire est celui des volontaires : il demande
      le code d'accès comme pour tout le monde. Pour inscrire quelqu'un toi-même, utilise plutôt{" "}
      <Link to="/admin/volontaires">Volontaires → + Ajouter</Link>.
    </p>
  );
}
