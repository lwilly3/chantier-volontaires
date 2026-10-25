import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import type { Constate } from "../lib/types";

interface Props {
  prevus: number;
  mineursPrevus: number;
  constate: Constate | null;
  /** Enregistre la saisie (route équipe ou lien dédié) */
  onEnregistrer: (data: { adultes: number; mineurs: number | null; note: string }) => Promise<void>;
  onEffacer?: () => Promise<void>;
  ouvertParDefaut?: boolean;
}

/** Saisie facultative du nombre approximatif de présents pour une journée. */
export default function SaisiePresents({ prevus, mineursPrevus, constate, onEnregistrer, onEffacer, ouvertParDefaut }: Props) {
  const [ouvert, setOuvert] = useState(!!ouvertParDefaut && !constate);
  const [adultes, setAdultes] = useState("");
  const [mineurs, setMineurs] = useState("");
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    setAdultes(constate ? String(constate.adultes) : "");
    setMineurs(constate?.mineurs != null ? String(constate.mineurs) : "");
    setNote(constate?.note ?? "");
    setErreur("");
  }, [constate]);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await onEnregistrer({ adultes: Number(adultes), mineurs: mineurs === "" ? null : Number(mineurs), note });
      setOuvert(false);
    } catch (err) {
      setErreur((err as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  };

  if (!ouvert) {
    return (
      <div className="presents-resume">
        {constate ? (
          <>
            <div>
              <b>{constate.adultes}</b> présent{constate.adultes > 1 ? "s" : ""} constaté{constate.adultes > 1 ? "s" : ""}
              {constate.mineurs ? <> + <b>{constate.mineurs}</b> mineur{constate.mineurs > 1 ? "s" : ""}</> : null}
              {prevus > 0 && <span className="taux"> · {Math.round((constate.adultes / prevus) * 100)} % des prévus</span>}
              <small className="saisi-par">Saisi par {constate.saisi_par}{constate.note && ` — « ${constate.note} »`}</small>
            </div>
            <button type="button" className="bouton petit" onClick={() => setOuvert(true)}>Modifier</button>
          </>
        ) : (
          <>
            <span className="aide">Facultatif : combien de personnes étaient là, à peu près ?</span>
            <button type="button" className="bouton petit principal" onClick={() => setOuvert(true)}>
              Indiquer les présents
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <form className="presents-form" onSubmit={valider}>
      <div className="presents-champs">
        <label className="champ">
          <span>Adultes présents <small>(≈, {prevus} prévus)</small></span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            required
            autoFocus
            value={adultes}
            onChange={(e) => setAdultes(e.target.value)}
          />
        </label>
        <label className="champ">
          <span>Mineurs <small>(facultatif{mineursPrevus ? `, ${mineursPrevus} prévus` : ""})</small></span>
          <input type="number" inputMode="numeric" min={0} max={500} value={mineurs} onChange={(e) => setMineurs(e.target.value)} />
        </label>
      </div>
      <label className="champ">
        <span>Note <small>(facultatif : météo, livraison, imprévu…)</small></span>
        <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {erreur && <p className="alerte">{erreur}</p>}
      <div className="actions">
        <button className="bouton principal" disabled={envoi || adultes === ""}>{envoi ? "…" : "Enregistrer"}</button>
        <button type="button" className="bouton discret" onClick={() => setOuvert(false)}>Annuler</button>
        {constate && onEffacer && (
          <button
            type="button"
            className="bouton discret danger"
            onClick={async () => {
              if (!confirm("Effacer la saisie de ce jour ?")) return;
              await onEffacer();
              setOuvert(false);
            }}
          >
            Effacer
          </button>
        )}
      </div>
    </form>
  );
}
