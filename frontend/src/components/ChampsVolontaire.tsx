import type { VolontaireForm } from "../lib/types";

interface Props {
  valeur: VolontaireForm;
  onChange: (v: VolontaireForm) => void;
  assemblees: string[];
  competences: string[];
}

export default function ChampsVolontaire({ valeur, onChange, assemblees, competences }: Props) {
  const maj = <K extends keyof VolontaireForm>(k: K, v: VolontaireForm[K]) => onChange({ ...valeur, [k]: v });
  const basculerComp = (c: string) =>
    maj("competences", valeur.competences.includes(c) ? valeur.competences.filter((x) => x !== c) : [...valeur.competences, c]);

  return (
    <div className="champs">
      <label className="champ">
        <span>Nom et prénom</span>
        <input
          required
          minLength={2}
          autoComplete="name"
          value={valeur.nom}
          onChange={(e) => maj("nom", e.target.value)}
          placeholder="Ex. Jean Mbarga"
        />
      </label>

      <label className="champ">
        <span>Numéro WhatsApp</span>
        <input
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={valeur.telephone}
          onChange={(e) => maj("telephone", e.target.value)}
          placeholder="6XX XX XX XX"
        />
      </label>

      <fieldset className="champ">
        <legend>Assemblée</legend>
        <div className="segment">
          {assemblees.map((a) => (
            <button
              key={a}
              type="button"
              className={valeur.assemblee === a ? "on" : ""}
              aria-pressed={valeur.assemblee === a}
              onClick={() => maj("assemblee", a)}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="champ">
        <legend>
          Ce que tu sais faire <small>(plusieurs choix possibles)</small>
        </legend>
        <div className="puces">
          {[...competences, "Autre"].map((c) => (
            <button
              key={c}
              type="button"
              className={`puce ${valeur.competences.includes(c) ? "on" : ""}`}
              aria-pressed={valeur.competences.includes(c)}
              onClick={() => basculerComp(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="champ">
        <legend>Mineurs à ta charge</legend>
        <label className="case-a-cocher">
          <input
            type="checkbox"
            checked={valeur.nb_mineurs > 0}
            onChange={(e) => maj("nb_mineurs", e.target.checked ? 1 : 0)}
          />
          <span>Je pourrais venir accompagné d'un ou plusieurs mineurs dont j'ai la charge</span>
        </label>
        {valeur.nb_mineurs > 0 && (
          <div className="compteur" role="group" aria-label="Nombre de mineurs">
            <button type="button" onClick={() => maj("nb_mineurs", Math.max(1, valeur.nb_mineurs - 1))} aria-label="Un de moins">−</button>
            <span>
              <b>{valeur.nb_mineurs}</b> mineur{valeur.nb_mineurs > 1 ? "s" : ""}
            </span>
            <button type="button" onClick={() => maj("nb_mineurs", Math.min(10, valeur.nb_mineurs + 1))} aria-label="Un de plus">+</button>
          </div>
        )}
        {valeur.est_mineur && (
          <p className="avertissement">Inscrit comme mineur avec l'ancien formulaire : à vérifier avec ses parents.</p>
        )}
      </fieldset>

      <label className="champ">
        <span>
          Remarques <small>(facultatif)</small>
        </span>
        <textarea
          rows={2}
          maxLength={1000}
          value={valeur.remarques}
          onChange={(e) => maj("remarques", e.target.value)}
          placeholder="Ex. je viens avec mes outils, disponible seulement après 10 h…"
        />
      </label>
    </div>
  );
}
