import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import ChampsVolontaire from "../components/ChampsVolontaire";
import DispoGrid from "../components/DispoGrid";
import LienPersonnel from "../components/LienPersonnel";
import { api, ApiError } from "../lib/api";
import { memoriserMonToken } from "../lib/liens";
import type { ConfigPublique, VolontaireForm, VolontairePublic } from "../lib/types";
import { Ecran } from "./Inscription";

export default function Moi() {
  const { token = "" } = useParams();
  const [config, setConfig] = useState<ConfigPublique | null>(null);
  const [form, setForm] = useState<VolontaireForm | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    Promise.all([
      api<ConfigPublique>(`/api/public/config?jeton=${encodeURIComponent(token)}`),
      api<VolontairePublic>(`/api/public/moi/${token}`),
    ])
      .then(([c, v]) => {
        setConfig(c);
        const { token: _t, ...reste } = v;
        setForm(reste);
        memoriserMonToken(token);
      })
      .catch((e: ApiError) => setErreur(e.message));
  }, [token]);

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErreur("");
    setMessage("");
    setEnvoi(true);
    try {
      const v = await api<VolontairePublic>(`/api/public/moi/${token}`, { method: "PUT", json: form });
      const { token: _t, ...reste } = v;
      setForm(reste);
      setMessage("Tes modifications sont enregistrées. Merci !");
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (!config || !form) {
    return <Ecran>{erreur ? <p className="alerte">{erreur}</p> : <p className="chargement">Chargement…</p>}</Ecran>;
  }

  return (
    <Ecran titre={config.nom_chantier}>
      <p className="intro">
        Bonjour <b>{form.nom.split(" ")[0]}</b>, tu peux mettre à jour tes informations et tes jours de présence.
        Si tu ne peux plus venir un jour prévu, retire-le ici dès que possible.
      </p>
      <form onSubmit={enregistrer} className="formulaire">
        <section className="carte">
          <h2>Mes disponibilités</h2>
          <DispoGrid
            jours={config.jours}
            valeur={form.disponibilites}
            onChange={(d) => setForm({ ...form, disponibilites: d })}
            remplissage={config.remplissage}
            plafond={config.plafond_jour}
            figeAvant={config.jours_figes_avant}
          />
        </section>
        <details className="carte">
          <summary>Mes informations</summary>
          <ChampsVolontaire valeur={form} onChange={setForm} assemblees={config.assemblees} competences={config.competences} />
        </details>
        <div className="barre-envoi">
          {erreur && <p className="alerte">{erreur}</p>}
          {message && <p className="ok">{message}</p>}
          <button className="bouton principal large" disabled={envoi}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
      <LienPersonnel token={token} nom={form.nom} monNumero={form.telephone} />
    </Ecran>
  );
}
