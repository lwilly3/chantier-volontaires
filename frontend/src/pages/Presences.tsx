import { useEffect, useState, type FormEvent } from "react";
import SaisiePresents from "../components/SaisiePresents";
import { api, ApiError } from "../lib/api";
import { long } from "../lib/dates";
import type { Constate } from "../lib/types";
import { Ecran } from "./Inscription";
import { DEMO, DEMO_MDP_PRESENCES } from "../lib/demo";

const CLE = "volontaires.presences";

interface Jour {
  jour: string;
  prevus: number;
  mineurs_prevus: number;
  saisie: Constate | null;
}

function lireJeton(): string {
  try {
    return localStorage.getItem(CLE) ?? "";
  } catch {
    return "";
  }
}

function ecrireJeton(t: string) {
  try {
    if (t) localStorage.setItem(CLE, t);
    else localStorage.removeItem(CLE);
  } catch {
    /* ignoré */
  }
}

/** Lien dédié : saisie du nombre de présents par les personnes désignées (mot de passe). */
export default function Presences() {
  const [etat, setEtat] = useState<{ actif: boolean; nom_chantier: string } | null>(null);
  const [jeton, setJeton] = useState(lireJeton);
  const [data, setData] = useState<{ nom: string; jours: Jour[] } | null>(null);
  const [erreur, setErreur] = useState("");
  const [tousLesJours, setTousLesJours] = useState(false);

  const entete = { Authorization: `Bearer ${jeton}` };

  const charger = () =>
    api<{ nom: string; jours: Jour[] }>("/api/presences/jours", { headers: entete })
      .then(setData)
      .catch((e: ApiError) => {
        if (e.status === 401) {
          ecrireJeton("");
          setJeton("");
        }
        setErreur(e.message);
      });

  useEffect(() => {
    api<{ actif: boolean; nom_chantier: string }>("/api/presences/etat").then(setEtat).catch(() => {});
  }, []);

  useEffect(() => {
    if (jeton) charger();
  }, [jeton]);

  if (!etat) return <Ecran titre="Présents du jour"><p className="chargement">Chargement…</p></Ecran>;
  if (!etat.actif) {
    return (
      <Ecran titre="Présents du jour">
        <div className="carte"><p>La saisie des présences n'est pas activée. Rapproche-toi du service volontaires.</p></div>
      </Ecran>
    );
  }
  if (!jeton) {
    return (
      <Connexion
        titre={etat.nom_chantier}
        erreurInitiale={erreur}
        onConnecte={(t) => {
          ecrireJeton(t);
          setErreur("");
          setJeton(t);
        }}
      />
    );
  }
  if (!data) return <Ecran titre="Présents du jour"><p className="chargement">{erreur || "Chargement…"}</p></Ecran>;

  const affiches = tousLesJours ? data.jours : data.jours.slice(0, 6);

  return (
    <Ecran titre="Présents du jour">
      <p className="intro">
        Bonjour <b>{data.nom.split(" ")[0]}</b>. Indique à peu près combien de personnes étaient présentes. C'est
        facultatif et modifiable : un nombre approximatif suffit.
      </p>
      {data.jours.length === 0 && (
        <div className="carte"><p>Le chantier n'a pas encore commencé : reviens le premier jour.</p></div>
      )}
      {affiches.map((j, i) => (
        <section className="carte" key={j.jour}>
          <div className="titre-section">
            <h2>{i === 0 && j.jour === data.jours[0].jour && !tousLesJours ? "Aujourd'hui — " : ""}{long(j.jour)}</h2>
            <span className="badge ok">{j.prevus} prévus</span>
          </div>
          <SaisiePresents
            prevus={j.prevus}
            mineursPrevus={j.mineurs_prevus}
            constate={j.saisie}
            ouvertParDefaut={i === 0}
            onEnregistrer={async (d) => {
              await api(`/api/presences/${j.jour}`, { method: "PUT", json: d, headers: entete });
              await charger();
            }}
          />
        </section>
      ))}
      {!tousLesJours && data.jours.length > 6 && (
        <button className="bouton large" onClick={() => setTousLesJours(true)}>Voir les jours plus anciens</button>
      )}
      <p className="lien-secondaire">
        <button
          type="button"
          className="lien-bouton"
          onClick={() => {
            ecrireJeton("");
            setJeton("");
            setData(null);
          }}
        >
          Se déconnecter
        </button>
      </p>
    </Ecran>
  );
}

function Connexion({ titre, erreurInitiale, onConnecte }: { titre: string; erreurInitiale: string; onConnecte: (t: string) => void }) {
  const [mdp, setMdp] = useState("");
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState(erreurInitiale);
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const r = await api<{ token: string }>("/api/presences/connexion", { method: "POST", json: { mot_de_passe: mdp, nom } });
      onConnecte(r.token);
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Ecran titre={titre}>
      <form className="carte formulaire connexion" onSubmit={valider}>
        <h2>Présents du jour</h2>
        <p className="aide">Espace réservé aux personnes chargées d'indiquer le nombre de présents sur le chantier.</p>
        <label className="champ">
          <span>Ton prénom</span>
          <input required minLength={2} maxLength={60} autoComplete="given-name" value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <label className="champ">
          <span>Mot de passe</span>
          <input type="password" required autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} />
        </label>
        {DEMO && (
          <p className="astuce-demo">
            Démo : le mot de passe est <b>{DEMO_MDP_PRESENCES}</b>.{" "}
            <button
              type="button"
              className="lien-bouton"
              onClick={() => {
                setMdp(DEMO_MDP_PRESENCES);
                if (!nom) setNom("Visiteur");
              }}
            >
              Le saisir pour moi
            </button>
          </p>
        )}
        {erreur && <p className="alerte">{erreur}</p>}
        <button className="bouton principal large" disabled={envoi}>{envoi ? "Vérification…" : "Continuer"}</button>
      </form>
    </Ecran>
  );
}
