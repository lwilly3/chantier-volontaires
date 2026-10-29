import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Session } from "../../lib/api";
import { Link } from "react-router-dom";
import Section from "../../components/Section";
import { useSession } from "../../lib/session";
import type { ConfigEmail, Parametres } from "../../lib/types";
import AccesFormulaire from "./AccesFormulaire";
import Comptes from "./Comptes";
import FinProjet from "./FinProjet";
import LienPresences from "./LienPresences";
import MonRecrutement from "./MonRecrutement";
import ReglagesEmail from "./ReglagesEmail";

const lignes = (txt: string) => txt.split("\n").map((l) => l.trim()).filter(Boolean);

export default function Reglages() {
  const { peut } = useSession();
  const responsable = peut("responsable");
  const [email, setEmail] = useState<ConfigEmail | null>(null);

  useEffect(() => {
    if (responsable) api<ConfigEmail>("/api/admin/email").then(setEmail).catch(() => {});
  }, [responsable]);

  return (
    <div className="reglages">
      <p className="aide intro-reglages">Touche une section pour l'ouvrir ou la refermer.</p>
      {responsable && <AccesFormulaire />}
      {peut("responsable", "adjoint", "relais") && <MonRecrutement />}
      {responsable && <Comptes emailActif={!!email?.actif} />}
      {responsable && <LienPresences />}
      {responsable && email && <ReglagesEmail config={email} onChange={setEmail} />}
      {responsable && <ParametresChantier />}
      <MotDePasse />
      {responsable && <FinProjet />}
    </div>
  );
}

interface Impact {
  jours_retires: number;
  jours_ajoutes: number;
  volontaires_concernes: number;
  inscriptions_retirees: number;
  devenus_sans_jour: number;
}

const cleDates = (debut: string, fin: string, fermes: string[]) => `${debut}|${fin}|${[...fermes].sort().join(",")}`;

function ParametresChantier() {
  const [p, setP] = useState<Parametres | null>(null);
  const [texte, setTexte] = useState({ competences: "", assemblees: "", jours_fermes: "" });
  const [etat, setEtat] = useState<{ erreur: string; ok: string; prevenir?: boolean }>({ erreur: "", ok: "" });
  const [datesEnregistrees, setDatesEnregistrees] = useState("");
  const [impact, setImpact] = useState<Impact | null>(null);

  useEffect(() => {
    api<Parametres>("/api/admin/parametres").then((d) => {
      setP(d);
      setDatesEnregistrees(cleDates(d.date_debut, d.date_fin, d.jours_fermes));
      setTexte({
        competences: d.competences.join("\n"),
        assemblees: d.assemblees.join("\n"),
        jours_fermes: d.jours_fermes.join("\n"),
      });
    });
  }, []);

  if (!p) return <p className="chargement">Chargement…</p>;
  const maj = <K extends keyof Parametres>(k: K, v: Parametres[K]) => setP({ ...p, [k]: v });

  const corps = () => ({
    ...p,
    competences: lignes(texte.competences),
    assemblees: lignes(texte.assemblees),
    jours_fermes: lignes(texte.jours_fermes),
  });

  const sauver = async (imp: Impact | null) => {
    try {
      const d = await api<Parametres>("/api/admin/parametres", { method: "PUT", json: corps() });
      setP(d);
      setDatesEnregistrees(cleDates(d.date_debut, d.date_fin, d.jours_fermes));
      setImpact(null);
      const prevenir = !!imp && (imp.volontaires_concernes > 0 || imp.devenus_sans_jour > 0);
      setEtat({ erreur: "", ok: "Réglages enregistrés.", prevenir });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    }
  };

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    setEtat({ erreur: "", ok: "" });
    const c = corps();
    if (cleDates(c.date_debut, c.date_fin, c.jours_fermes) !== datesEnregistrees) {
      // Dates ou jours sans chantier modifiés : on montre d'abord les conséquences
      try {
        const imp = await api<Impact>("/api/admin/parametres/impact", { method: "POST", json: c });
        if (imp.volontaires_concernes > 0 || imp.devenus_sans_jour > 0) {
          setImpact(imp);
          return;
        }
        return sauver(imp);
      } catch (err) {
        return setEtat({ erreur: (err as ApiError).message, ok: "" });
      }
    }
    return sauver(null);
  };

  return (
    <Section
      id="chantier"
      titre="Chantier"
      resume="Dates, plafond, assemblées, compétences, communauté"
      badge={
        p.inscriptions_ouvertes ? (
          <span className="badge ok">
            {new Date(p.date_debut).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} →{" "}
            {new Date(p.date_fin).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · {p.plafond_jour}/jour
          </span>
        ) : (
          <span className="badge complet">Inscriptions fermées</span>
        )
      }
    >
    <form className="formulaire" onSubmit={enregistrer}>
      <label className={`case-a-cocher interrupteur-inscriptions ${p.inscriptions_ouvertes ? "" : "ferme"}`}>
        <input type="checkbox" checked={p.inscriptions_ouvertes} onChange={(e) => maj("inscriptions_ouvertes", e.target.checked)} />
        <span>
          <b>Inscriptions ouvertes</b>{" "}
          <small>
            {p.inscriptions_ouvertes
              ? "(les volontaires peuvent s'inscrire)"
              : "— fermées : décoche/coche puis « Enregistrer les réglages » en bas de la section"}
          </small>
        </span>
      </label>
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
      <label className="champ">
        <span>
          Responsable des données <small>(nom affiché dans les mentions légales — aucun numéro n'y est publié)</small>
        </span>
        <input maxLength={120} value={p.responsable_donnees} onChange={(e) => maj("responsable_donnees", e.target.value)} placeholder="ex. Responsable du service volontaires" />
      </label>
      <label className="champ">
        <span>
          Lien d'invitation de la communauté WhatsApp <small>(facultatif)</small>
        </span>
        <input
          type="url"
          placeholder="https://chat.whatsapp.com/…"
          value={p.lien_communaute}
          onChange={(e) => maj("lien_communaute", e.target.value)}
        />
        <small className="aide">
          WhatsApp → ta communauté → « Inviter des membres » → « Copier le lien ». Il s'affiche aux volontaires après
          leur inscription et sur leur page personnelle, et peut être inséré dans les messages avec {"{communauté}"}.
        </small>
      </label>
      <label className="case-a-cocher">
        <input
          type="checkbox"
          checked={p.compter_mineurs_plafond}
          onChange={(e) => maj("compter_mineurs_plafond", e.target.checked)}
        />
        <span>
          Compter les mineurs accompagnés dans le plafond par jour{" "}
          <small>(un volontaire avec 2 mineurs occupe alors 3 places)</small>
        </span>
      </label>
      <label className="case-a-cocher">
        <input
          type="checkbox"
          checked={p.figer_jours_passes}
          onChange={(e) => maj("figer_jours_passes", e.target.checked)}
        />
        <span>
          Figer les jours passés pour les volontaires{" "}
          <small>
            (ils ne peuvent plus ajouter, retirer ou changer un jour antérieur à aujourd'hui ; l'équipe peut toujours
            corriger depuis la fiche du volontaire)
          </small>
        </span>
      </label>
      {etat.erreur && <p className="alerte">{etat.erreur}</p>}
      {etat.ok && (
        <p className="ok">
          {etat.ok}
          {etat.prevenir && (
            <>
              {" "}
              <Link to="/admin/messages?cible=hors_dates">Prévenir les volontaires concernés →</Link>
            </>
          )}
        </p>
      )}
      {impact ? (
        <div className="impact-dates">
          <p>
            <b>Ce changement de dates concerne des volontaires déjà inscrits :</b>
          </p>
          <ul>
            {impact.volontaires_concernes > 0 && (
              <li>
                {impact.volontaires_concernes} volontaire{impact.volontaires_concernes > 1 ? "s ont" : " a"} des jours
                hors des nouvelles dates ({impact.inscriptions_retirees} inscription
                {impact.inscriptions_retirees > 1 ? "s" : ""} sur des jours qui ne comptent plus) ;
              </li>
            )}
            {impact.devenus_sans_jour > 0 && (
              <li>
                <b>
                  {impact.devenus_sans_jour} n'{impact.devenus_sans_jour > 1 ? "auront" : "aura"} plus aucun jour
                </b>{" "}
                dans le chantier ;
              </li>
            )}
            {impact.jours_ajoutes > 0 && (
              <li>
                {impact.jours_ajoutes} nouveau{impact.jours_ajoutes > 1 ? "x" : ""} jour{impact.jours_ajoutes > 1 ? "s" : ""} de
                chantier, encore vide{impact.jours_ajoutes > 1 ? "s" : ""}.
              </li>
            )}
          </ul>
          <p className="aide">
            Rien n'est effacé tout de suite : ces jours ne comptent plus, et disparaîtront quand la fiche sera enregistrée.
            Après l'enregistrement, tu pourras prévenir ces volontaires depuis Messages.
          </p>
          <div className="actions">
            <button type="button" className="bouton principal" onClick={() => sauver(impact)}>
              Enregistrer quand même
            </button>
            <button type="button" className="bouton discret" onClick={() => setImpact(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button className="bouton principal">Enregistrer les réglages</button>
      )}
    </form>
    </Section>
  );
}

function MotDePasse() {
  const { connecter } = useSession();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [etat, setEtat] = useState({ erreur: "", ok: "" });

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const s = await api<Session>("/api/auth/mot-de-passe", { method: "POST", json: { ancien, nouveau } });
      connecter(s); // nouvelle session ; les autres appareils sont déconnectés
      setAncien("");
      setNouveau("");
      setEtat({ erreur: "", ok: "Mot de passe modifié. Tes autres appareils ont été déconnectés." });
    } catch (err) {
      setEtat({ erreur: (err as ApiError).message, ok: "" });
    }
  };

  return (
    <Section id="mdp" titre="Mon mot de passe" resume="Changer le mot de passe de ton compte">
    <form className="formulaire" onSubmit={envoyer}>
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
    </Section>
  );
}
