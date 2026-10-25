import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { LIBELLE_ROLE, useSession } from "../../lib/session";
import type { Parametres, Role, Utilisateur } from "../../lib/types";

const lignes = (txt: string) => txt.split("\n").map((l) => l.trim()).filter(Boolean);

export default function Reglages() {
  const { peut } = useSession();
  return (
    <div className="reglages">
      {peut("responsable") && <ParametresChantier />}
      {peut("responsable") && <Comptes />}
      <MotDePasse />
    </div>
  );
}

function ParametresChantier() {
  const [p, setP] = useState<Parametres | null>(null);
  const [texte, setTexte] = useState({ competences: "", assemblees: "", jours_fermes: "" });
  const [etat, setEtat] = useState({ erreur: "", ok: "" });

  useEffect(() => {
    api<Parametres>("/api/admin/parametres").then((d) => {
      setP(d);
      setTexte({
        competences: d.competences.join("\n"),
        assemblees: d.assemblees.join("\n"),
        jours_fermes: d.jours_fermes.join("\n"),
      });
    });
  }, []);

  if (!p) return <p className="chargement">Chargement…</p>;
  const maj = <K extends keyof Parametres>(k: K, v: Parametres[K]) => setP({ ...p, [k]: v });

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setEtat({ erreur: "", ok: "" });
    try {
      const d = await api<Parametres>("/api/admin/parametres", {
        method: "PUT",
        json: {
          ...p,
          competences: lignes(texte.competences),
          assemblees: lignes(texte.assemblees),
          jours_fermes: lignes(texte.jours_fermes),
        },
      });
      setP(d);
      setEtat({ erreur: "", ok: "Réglages enregistrés." });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    }
  };

  return (
    <form className="carte formulaire" onSubmit={enregistrer}>
      <h2>Chantier</h2>
      <label className="champ">
        <span>Nom du chantier</span>
        <input value={p.nom_chantier} onChange={(e) => maj("nom_chantier", e.target.value)} />
      </label>
      <div className="deux-colonnes">
        <label className="champ">
          <span>Premier jour</span>
          <input type="date" value={p.date_debut} onChange={(e) => maj("date_debut", e.target.value)} />
        </label>
        <label className="champ">
          <span>Dernier jour</span>
          <input type="date" value={p.date_fin} onChange={(e) => maj("date_fin", e.target.value)} />
        </label>
        <label className="champ">
          <span>Plafond par jour (sécurité)</span>
          <input type="number" min={1} value={p.plafond_jour} onChange={(e) => maj("plafond_jour", Number(e.target.value))} />
        </label>
        <label className="champ">
          <span>Alerte à partir de</span>
          <input type="number" min={1} value={p.seuil_alerte} onChange={(e) => maj("seuil_alerte", Number(e.target.value))} />
        </label>
      </div>
      <label className="champ">
        <span>Jours sans chantier <small>(un par ligne, format AAAA-MM-JJ)</small></span>
        <textarea rows={3} value={texte.jours_fermes} onChange={(e) => setTexte({ ...texte, jours_fermes: e.target.value })} />
      </label>
      <label className="champ">
        <span>Assemblées <small>(une par ligne)</small></span>
        <textarea rows={2} value={texte.assemblees} onChange={(e) => setTexte({ ...texte, assemblees: e.target.value })} />
      </label>
      <label className="champ">
        <span>Compétences proposées <small>(une par ligne)</small></span>
        <textarea rows={6} value={texte.competences} onChange={(e) => setTexte({ ...texte, competences: e.target.value })} />
      </label>
      <label className="champ">
        <span>Message d'accueil du formulaire</span>
        <textarea rows={3} value={p.message_accueil} onChange={(e) => maj("message_accueil", e.target.value)} />
      </label>
      <label className="case-a-cocher">
        <input type="checkbox" checked={p.inscriptions_ouvertes} onChange={(e) => maj("inscriptions_ouvertes", e.target.checked)} />
        <span>Inscriptions ouvertes</span>
      </label>
      {etat.erreur && <p className="alerte">{etat.erreur}</p>}
      {etat.ok && <p className="ok">{etat.ok}</p>}
      <button className="bouton principal">Enregistrer les réglages</button>
    </form>
  );
}

const VIDE_COMPTE = { nom: "", email: "", role: "adjoint" as Role, password: "", actif: true };

function Comptes() {
  const [comptes, setComptes] = useState<Utilisateur[]>([]);
  const [edition, setEdition] = useState<(typeof VIDE_COMPTE & { id?: number }) | null>(null);
  const [erreur, setErreur] = useState("");

  const charger = () => api<Utilisateur[]>("/api/admin/utilisateurs").then(setComptes);
  useEffect(() => {
    charger();
  }, []);

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (!edition) return;
    setErreur("");
    const { id, ...corps } = edition;
    try {
      await api(id ? `/api/admin/utilisateurs/${id}` : "/api/admin/utilisateurs", {
        method: id ? "PUT" : "POST",
        json: { ...corps, password: corps.password || null },
      });
      setEdition(null);
      charger();
    } catch (err) {
      setErreur((err as ApiError).message);
    }
  };

  return (
    <section className="carte">
      <div className="titre-section">
        <h2>Comptes de l'équipe</h2>
        <button className="bouton" onClick={() => setEdition({ ...VIDE_COMPTE })}>+ Ajouter</button>
      </div>
      <p className="aide">
        <b>Adjoint</b> : gère les volontaires. <b>Cuisine</b> et <b>Comité</b> : voient uniquement les effectifs par jour.
      </p>
      <ul className="comptes">
        {comptes.map((c) => (
          <li key={c.id} className={c.actif ? "" : "inactif"}>
            <span>
              <b>{c.nom}</b> <small>{c.email}</small>
            </span>
            <span className="badge ok">{LIBELLE_ROLE[c.role]}</span>
            <button className="bouton discret" onClick={() => setEdition({ ...c, password: "" })}>Modifier</button>
          </li>
        ))}
      </ul>

      {edition && (
        <form className="formulaire sous-carte" onSubmit={enregistrer}>
          <h3>{edition.id ? "Modifier le compte" : "Nouveau compte"}</h3>
          <label className="champ">
            <span>Nom</span>
            <input required value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
          </label>
          <label className="champ">
            <span>E-mail</span>
            <input type="email" required value={edition.email} onChange={(e) => setEdition({ ...edition, email: e.target.value })} />
          </label>
          <label className="champ">
            <span>Rôle</span>
            <select value={edition.role} onChange={(e) => setEdition({ ...edition, role: e.target.value as Role })}>
              {(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => (
                <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>
              ))}
            </select>
          </label>
          <label className="champ">
            <span>{edition.id ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe (8 caractères minimum)"}</span>
            <input
              type="text"
              autoComplete="new-password"
              minLength={8}
              required={!edition.id}
              value={edition.password}
              onChange={(e) => setEdition({ ...edition, password: e.target.value })}
            />
          </label>
          <label className="case-a-cocher">
            <input type="checkbox" checked={edition.actif} onChange={(e) => setEdition({ ...edition, actif: e.target.checked })} />
            <span>Compte actif</span>
          </label>
          {erreur && <p className="alerte">{erreur}</p>}
          <div className="actions">
            <button className="bouton principal">Enregistrer</button>
            <button type="button" className="bouton discret" onClick={() => setEdition(null)}>Annuler</button>
          </div>
        </form>
      )}
    </section>
  );
}

function MotDePasse() {
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [etat, setEtat] = useState({ erreur: "", ok: "" });

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/mot-de-passe", { method: "POST", json: { ancien, nouveau } });
      setAncien("");
      setNouveau("");
      setEtat({ erreur: "", ok: "Mot de passe modifié." });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    }
  };

  return (
    <form className="carte formulaire" onSubmit={envoyer}>
      <h2>Mon mot de passe</h2>
      <label className="champ">
        <span>Mot de passe actuel</span>
        <input type="password" autoComplete="current-password" required value={ancien} onChange={(e) => setAncien(e.target.value)} />
      </label>
      <label className="champ">
        <span>Nouveau mot de passe (8 caractères minimum)</span>
        <input type="password" autoComplete="new-password" minLength={8} required value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
      </label>
      {etat.erreur && <p className="alerte">{etat.erreur}</p>}
      {etat.ok && <p className="ok">{etat.ok}</p>}
      <button className="bouton">Changer le mot de passe</button>
    </form>
  );
}
