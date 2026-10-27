import { useState, type FormEvent } from "react";
import Section from "../../components/Section";
import { api, ApiError, telecharger } from "../../lib/api";

interface Apercu {
  volontaires: number;
  disponibilites: number;
  presences: number;
  journal: number;
  comptes_equipe: number;
  email_configure: boolean;
}

type Mode = "anonymiser" | "effacer";

/** Fin du projet : effacer ou anonymiser les données personnelles (responsable uniquement). */
export default function FinProjet() {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [mode, setMode] = useState<Mode>("anonymiser");
  const [supprimerComptes, setSupprimerComptes] = useState(true);
  const [fermer, setFermer] = useState(true);
  const [effacerEmail, setEffacerEmail] = useState(true);
  const [exporte, setExporte] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [mdp, setMdp] = useState("");
  const [etat, setEtat] = useState({ erreur: "", ok: "", occupe: false });

  const charger = () =>
    api<Apercu>("/api/admin/fin-de-projet/apercu").then(setApercu).catch((e: ApiError) => setEtat({ erreur: e.message, ok: "", occupe: false }));

  const exporter = async () => {
    try {
      await telecharger("/api/admin/export/volontaires.csv", "volontaires-fin-de-projet.csv");
      setExporte(true);
    } catch (e) {
      setEtat({ erreur: (e as ApiError).message, ok: "", occupe: false });
    }
  };

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    const libelle = mode === "anonymiser" ? "anonymiser" : "EFFACER DÉFINITIVEMENT";
    if (!window.confirm(`Dernière vérification : ${libelle} les données de ${apercu?.volontaires ?? "?"} volontaire(s) ? Cette action est irréversible.`)) return;
    setEtat({ erreur: "", ok: "", occupe: true });
    try {
      await api("/api/admin/fin-de-projet", {
        method: "POST",
        json: {
          mode,
          supprimer_comptes: supprimerComptes,
          fermer_inscriptions: fermer,
          effacer_config_email: effacerEmail,
          mot_de_passe: mdp,
          confirmation,
        },
      });
      setMdp("");
      setConfirmation("");
      setEtat({
        erreur: "",
        ok:
          mode === "anonymiser"
            ? "Données anonymisées. Les statistiques restent consultables (Couverture, Analyses)."
            : "Données effacées.",
        occupe: false,
      });
      await charger();
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "", occupe: false });
    }
  };

  return (
    <Section
      id="fin-projet"
      titre="Fin du projet : protection des données"
      resume="Effacer ou anonymiser les données personnelles à la fin du chantier"
      badge={<span className="badge vide">Irréversible</span>}
    >
      {!apercu ? (
        <>
          <p className="aide">
            À utiliser une fois le chantier terminé. Les noms et numéros des volontaires ne doivent pas être conservés
            plus longtemps que nécessaire.
          </p>
          <button type="button" className="bouton" onClick={charger}>
            Préparer l'effacement
          </button>
          {etat.erreur && <p className="alerte">{etat.erreur}</p>}
        </>
      ) : (
        <form className="formulaire fin-projet" onSubmit={valider}>
          <p className="aide">
            Actuellement : <b>{apercu.volontaires}</b> volontaire(s), {apercu.disponibilites} jour(s) d'inscription,{" "}
            {apercu.presences} saisie(s) de présents, {apercu.journal} ligne(s) de journal, {apercu.comptes_equipe}{" "}
            autre(s) compte(s) d'équipe.
          </p>

          <div className="bloc-fin">
            <h3>1. Garder une copie (conseillé)</h3>
            <p className="aide">
              Télécharge la liste des volontaires avant l'effacement si l'assemblée doit en conserver une trace. Range ce
              fichier en lieu sûr, puis supprime-le quand il n'est plus utile.
            </p>
            <button type="button" className="bouton" onClick={exporter}>
              {exporte ? "✓ Export téléchargé" : "Télécharger l'export (Excel)"}
            </button>
          </div>

          <div className="bloc-fin">
            <h3>2. Que faire des données ?</h3>
            <label className={`choix-mode ${mode === "anonymiser" ? "on" : ""}`}>
              <input type="radio" name="mode" checked={mode === "anonymiser"} onChange={() => setMode("anonymiser")} />
              <span>
                <span>
                  <b>Anonymiser</b> (recommandé)
                </span>
                <small>
                  Noms, numéros, remarques, liens personnels et journal effacés. Les chiffres anonymes restent : inscrits
                  par jour, présents, analyses — utiles pour préparer un prochain chantier.
                </small>
              </span>
            </label>
            <label className={`choix-mode ${mode === "effacer" ? "on" : ""}`}>
              <input type="radio" name="mode" checked={mode === "effacer"} onChange={() => setMode("effacer")} />
              <span>
                <b>Tout effacer</b>
                <small>Volontaires, jours, présents et journal supprimés. Il ne reste que les réglages.</small>
              </span>
            </label>
          </div>

          <div className="bloc-fin">
            <h3>3. Et aussi</h3>
            <label className="case-a-cocher">
              <input type="checkbox" checked={supprimerComptes} onChange={(e) => setSupprimerComptes(e.target.checked)} />
              <span>
                Supprimer les comptes de l'équipe <small>(adjoints, hommes clés, cuisine, comité — le tien est conservé)</small>
              </span>
            </label>
            <label className="case-a-cocher">
              <input type="checkbox" checked={fermer} onChange={(e) => setFermer(e.target.checked)} />
              <span>Fermer les inscriptions et désactiver le lien des présents</span>
            </label>
            <label className="case-a-cocher">
              <input type="checkbox" checked={effacerEmail} onChange={(e) => setEffacerEmail(e.target.checked)} />
              <span>
                Effacer la configuration d'e-mail <small>(identifiant et mot de passe SMTP)</small>
              </span>
            </label>
          </div>

          <div className="bloc-fin">
            <h3>4. Confirmer</h3>
            <label className="champ">
              <span>
                Tape <b>EFFACER</b>
              </span>
              <input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </label>
            <label className="champ">
              <span>Ton mot de passe</span>
              <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} />
            </label>
            {etat.erreur && <p className="alerte">{etat.erreur}</p>}
            {etat.ok && <p className="ok">✓ {etat.ok}</p>}
            <button
              className="bouton danger-plein"
              disabled={etat.occupe || confirmation.trim().toUpperCase() !== "EFFACER" || !mdp}
            >
              {etat.occupe ? "…" : mode === "anonymiser" ? "Anonymiser les données" : "Tout effacer définitivement"}
            </button>
          </div>

          <p className="avertissement">
            Les sauvegardes automatiques de la base (Dokploy → Cloudflare R2) contiennent encore les anciennes données
            jusqu'à leur expiration : supprime-les aussi dans R2 une fois l'effacement fait.
          </p>
        </form>
      )}
    </Section>
  );
}
