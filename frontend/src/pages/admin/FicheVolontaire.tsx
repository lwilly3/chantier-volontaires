import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChampsVolontaire from "../../components/ChampsVolontaire";
import DispoGrid from "../../components/DispoGrid";
import LienPersonnel from "../../components/LienPersonnel";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/session";
import type { ConfigPublique, EntreeJournal, VolontaireAdmin, VolontaireForm } from "../../lib/types";
import { VIDE } from "../Inscription";
import { LIBELLE_ACTION } from "./Journal";

export default function FicheVolontaire() {
  const { id } = useParams();
  const nouveau = id === "nouveau";
  const nav = useNavigate();
  const { peut } = useSession();
  const voitJournal = peut("responsable", "adjoint");
  const [config, setConfig] = useState<ConfigPublique | null>(null);
  const [v, setV] = useState<VolontaireAdmin | null>(null);
  const [form, setForm] = useState<VolontaireForm>(VIDE);
  const [actif, setActif] = useState(true);
  const [journal, setJournal] = useState<EntreeJournal[]>([]);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = (data: VolontaireAdmin) => {
    setV(data);
    setActif(data.actif);
    setForm({
      nom: data.nom,
      telephone: data.telephone,
      assemblee: data.assemblee,
      competences: data.competences,
      est_mineur: data.est_mineur,
      remarques: data.remarques,
      disponibilites: data.disponibilites,
    });
  };

  useEffect(() => {
    api<ConfigPublique>("/api/public/config").then(setConfig).catch((e: ApiError) => setErreur(e.message));
    if (!nouveau) {
      api<VolontaireAdmin>(`/api/admin/volontaires/${id}`).then(charger).catch((e: ApiError) => setErreur(e.message));
      if (voitJournal) api<EntreeJournal[]>(`/api/admin/journal?volontaire_id=${id}&limite=30`).then(setJournal).catch(() => {});
    }
  }, [id, nouveau, voitJournal]);

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setMessage("");
    if (!form.assemblee) return setErreur("Choisis l'assemblée.");
    setEnvoi(true);
    try {
      if (nouveau) {
        const cree = await api<VolontaireAdmin>("/api/admin/volontaires", { method: "POST", json: form });
        nav(`/admin/volontaires/${cree.id}`, { replace: true });
      } else {
        charger(await api<VolontaireAdmin>(`/api/admin/volontaires/${id}`, { method: "PUT", json: { ...form, actif } }));
        setMessage("Enregistré.");
        if (voitJournal) api<EntreeJournal[]>(`/api/admin/journal?volontaire_id=${id}&limite=30`).then(setJournal);
      }
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  const nouveauLien = async () => {
    if (!confirm("L'ancien lien ne fonctionnera plus. Générer un nouveau lien ?")) return;
    charger(await api<VolontaireAdmin>(`/api/admin/volontaires/${id}/nouveau-lien`, { method: "POST" }));
    setMessage("Nouveau lien généré. Envoie-le au volontaire.");
  };

  const supprimer = async () => {
    if (!confirm(`Supprimer définitivement ${v?.nom} et toutes ses disponibilités ?`)) return;
    await api(`/api/admin/volontaires/${id}`, { method: "DELETE" });
    nav("/admin/volontaires", { replace: true });
  };

  if (!config || (!nouveau && !v)) {
    return erreur ? <p className="alerte">{erreur}</p> : <p className="chargement">Chargement…</p>;
  }

  return (
    <div className="fiche">
      <Link to="/admin/volontaires" className="retour">← Volontaires</Link>
      <h2>{nouveau ? "Nouveau volontaire" : v!.nom}</h2>
      {v?.recrute_par && <p className="aide">Recruté par <b>{v.recrute_par}</b></p>}

      <form onSubmit={enregistrer} className="formulaire">
        <section className="carte">
          <ChampsVolontaire valeur={form} onChange={setForm} assemblees={config.assemblees} competences={config.competences} />
          {!nouveau && (
            <label className="case-a-cocher">
              <input type="checkbox" checked={!actif} onChange={(e) => setActif(!e.target.checked)} />
              <span>Désactivé (ne compte plus dans les prévisions)</span>
            </label>
          )}
        </section>
        <section className="carte">
          <h3>Disponibilités</h3>
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
          {message && <p className="ok">{message}</p>}
          <button className="bouton principal large" disabled={envoi}>
            {envoi ? "Enregistrement…" : nouveau ? "Créer le volontaire" : "Enregistrer"}
          </button>
        </div>
      </form>

      {v && (
        <>
          <LienPersonnel token={v.token} nom={v.nom} telephone={v.telephone} />
          <div className="actions secondaires">
            <button className="bouton" onClick={nouveauLien}>Générer un nouveau lien</button>
            {peut("responsable") && (
              <button className="bouton danger" onClick={supprimer}>Supprimer</button>
            )}
          </div>
          {journal.length > 0 && (
            <section className="carte">
              <h3>Historique</h3>
              <ul className="journal">
                {journal.map((j) => (
                  <li key={j.id}>
                    <time>{new Date(j.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
                    <span>
                      <b>{LIBELLE_ACTION[j.action] ?? j.action}</b> par {j.acteur}
                      {j.details && <small> — {j.details}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
