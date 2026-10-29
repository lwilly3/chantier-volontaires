import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { court, ENTETES_SEMAINE, long, numeroJour, semaines, versDate, versIso } from "../../lib/dates";
import { copier } from "../../lib/liens";
import AlerteInscriptionsFermees from "../../components/AlerteInscriptionsFermees";
import SaisiePresents from "../../components/SaisiePresents";
import { useSession } from "../../lib/session";
import type { Couverture as TCouverture, JourCouverture, VolontaireDuJour } from "../../lib/types";
import { LIBELLE_CRENEAU } from "../../lib/dates";

function niveau(j: JourCouverture, plafond: number): string {
  if (j.statut === "vide") return "vide";
  if (j.statut === "complet") return "complet";
  if (j.statut === "presque") return "presque";
  return j.total < plafond / 2 ? "faible" : "ok";
}

export default function Couverture() {
  const [data, setData] = useState<TCouverture | null>(null);
  const [erreur, setErreur] = useState("");
  const [selection, setSelection] = useState<string | null>(null);

  const charger = (initial: boolean) =>
    api<TCouverture>("/api/admin/couverture")
      .then((d) => {
        setData(d);
        if (initial) {
          const aujourdhui = versIso(new Date());
          const prochain = d.jours.find((j) => j.jour >= aujourdhui) ?? d.jours[0];
          setSelection(prochain?.jour ?? null);
        }
      })
      .catch((e: ApiError) => setErreur(e.message));

  useEffect(() => {
    charger(true);
  }, []);

  const parJour = useMemo(() => new Map(data?.jours.map((j) => [j.jour, j]) ?? []), [data]);
  const grille = useMemo(() => semaines(data?.jours.map((j) => j.jour) ?? []), [data]);

  if (erreur) return <p className="alerte">{erreur}</p>;
  if (!data) return <p className="chargement">Chargement…</p>;
  const { resume, plafond_jour: plafond } = data;
  const jourSel = selection ? parJour.get(selection) : undefined;

  return (
    <div className="couverture">
      <AlerteInscriptionsFermees />
      <section className="tuiles">
        <Tuile valeur={resume.volontaires} libelle="volontaires inscrits">
          {Object.entries(resume.par_assemblee).map(([a, n]) => (
            <span key={a}>{a} : {n}</span>
          ))}
        </Tuile>
        <Tuile valeur={resume.moyenne_jour} libelle={`en moyenne par jour (max ${plafond})`} />
        <Tuile valeur={resume.jours_vides} libelle="jours sans personne" alerte={resume.jours_vides > 0} />
        <Tuile valeur={resume.jours_complets} libelle="jours complets" />
        {resume.sans_disponibilite > 0 && (
          <Tuile valeur={resume.sans_disponibilite} libelle="inscrits sans aucun jour" alerte />
        )}
      </section>

      <section className="carte">
        <div className="titre-section">
          <h2>Couverture par jour</h2>
          <div className="legende-niveaux">
            <span className="niv vide">0</span>
            <span className="niv faible">faible</span>
            <span className="niv ok">bon</span>
            <span className="niv presque">≥ {data.seuil_alerte}</span>
            <span className="niv complet">plein</span>
          </div>
        </div>
        <div className="calendrier">
          <div className="cal-entete">
            {ENTETES_SEMAINE.map((n) => <span key={n}>{n}</span>)}
          </div>
          {grille.map((s) => (
            <div className="cal-ligne" key={s.lundi}>
              {s.cases.map((iso, i) => {
                if (!iso) return <span key={i} className="cal-case hors" />;
                const j = parJour.get(iso)!;
                const pct = Math.min(100, Math.round((j.total / plafond) * 100));
                const premierDuMois = versDate(iso).getDate() === 1 || iso === data.jours[0].jour;
                return (
                  <button
                    key={iso}
                    className={`cal-case ${niveau(j, plafond)} ${selection === iso ? "sel" : ""}`}
                    onClick={() => setSelection(iso)}
                    aria-label={`${court(iso)} : ${j.total} sur ${plafond}`}
                  >
                    <span className="cal-date">{premierDuMois ? court(iso).split(" ").slice(1).join(" ") : numeroJour(iso)}</span>
                    <span className="cal-total">
                      {j.total}
                      {j.constate && <span className="cal-constate" title="Présents constatés">✓{j.constate.adultes}</span>}
                    </span>
                    <span className="jauge"><span style={{ width: `${pct}%` }} /></span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {jourSel && (
        <DetailJour
          jour={jourSel}
          plafond={plafond}
          aujourdhui={data.aujourdhui}
          compterMineurs={data.compter_mineurs_plafond}
          recharger={() => charger(false)}
        />
      )}
    </div>
  );
}

function Tuile({ valeur, libelle, alerte, children }: { valeur: number; libelle: string; alerte?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`tuile ${alerte ? "alerte-tuile" : ""}`}>
      <b>{valeur}</b>
      <span>{libelle}</span>
      {children && <small>{children}</small>}
    </div>
  );
}

function DetailJour({
  jour, plafond, aujourdhui, compterMineurs, recharger,
}: {
  jour: JourCouverture; plafond: number; aujourdhui: string; compterMineurs: boolean; recharger: () => Promise<void>;
}) {
  const { peut } = useSession();
  const equipe = peut("responsable", "adjoint", "relais");
  const saisie = peut("responsable", "adjoint");
  const passe = jour.jour <= aujourdhui;
  const [liste, setListe] = useState<VolontaireDuJour[] | null>(null);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    setListe(null);
    if (equipe) api<{ volontaires: VolontaireDuJour[] }>(`/api/admin/jours/${jour.jour}`).then((r) => setListe(r.volontaires));
  }, [jour.jour, equipe]);

  const message = () => {
    if (!liste) return "";
    const presents = liste.filter((v) => !v.en_reserve);
    const reserve = liste.filter((v) => v.en_reserve);
    const ligne = (v: VolontaireDuJour, i: number) =>
      `${i + 1}. ${v.nom}${v.creneau !== "journee" ? ` (${LIBELLE_CRENEAU[v.creneau].toLowerCase()})` : ""}` +
      (v.nb_mineurs ? ` + ${v.nb_mineurs} mineur${v.nb_mineurs > 1 ? "s" : ""}` : "");
    const mineursPresents = presents.reduce((n, v) => n + v.nb_mineurs, 0);
    return [
      `*Chantier Salle du Royaume — ${long(jour.jour)}*`,
      `Volontaires attendus : ${presents.length}` +
        (mineursPresents ? ` (+ ${mineursPresents} mineur${mineursPresents > 1 ? "s" : ""} accompagné${mineursPresents > 1 ? "s" : ""})` : ""),
      "",
      ...presents.map(ligne),
      ...(reserve.length ? ["", `_En réserve (${reserve.length})_ :`, ...reserve.map(ligne)] : []),
      "",
      "Merci de prévenir le service volontaires en cas d'empêchement.",
    ].join("\n");
  };

  const competences = Object.entries(jour.par_competence);

  return (
    <section className="carte detail-jour">
      <div className="titre-section">
        <h2>{long(jour.jour)}</h2>
        <span className={`badge ${jour.statut}`}>
          {jour.total} / {plafond}
        </span>
      </div>

      <div className="chiffres">
        <div><b>{jour.presents + jour.mineurs}</b><span>repas à prévoir{jour.mineurs > 0 && " (mineurs inclus)"}</span></div>
        {jour.probables != null && (
          <div className="probable">
            <b>≈ {jour.probables}</b>
            <span>présents probables{jour.repas_probables != null && ` · ≈ ${jour.repas_probables} repas`}</span>
          </div>
        )}
        {jour.mineurs > 0 && <div><b>+{jour.mineurs}</b><span>mineur{jour.mineurs > 1 ? "s" : ""} accompagné{jour.mineurs > 1 ? "s" : ""}</span></div>}
        <div><b>{jour.matin}</b><span>le matin</span></div>
        <div><b>{jour.apres_midi}</b><span>l'après-midi</span></div>
        {jour.reserve > 0 && <div className="alerte-tuile"><b>{jour.reserve}</b><span>en réserve</span></div>}
      </div>

      {compterMineurs && jour.mineurs > 0 && (
        <p className="aide">Les mineurs accompagnés comptent dans le plafond : {jour.occupation} / {plafond} places occupées.</p>
      )}

      {passe && (saisie || jour.constate) && (
        <div className="bloc-presents">
          <h3>Présents constatés</h3>
          {saisie ? (
            <SaisiePresents
              prevus={jour.presents}
              mineursPrevus={jour.mineurs}
              constate={jour.constate}
              onEnregistrer={async (d) => {
                await api(`/api/admin/presences/${jour.jour}`, { method: "PUT", json: d });
                await recharger();
              }}
              onEffacer={async () => {
                await api(`/api/admin/presences/${jour.jour}`, { method: "DELETE" });
                await recharger();
              }}
            />
          ) : (
            jour.constate && (
              <p>
                <b>{jour.constate.adultes}</b> présents constatés
                {jour.constate.mineurs ? ` + ${jour.constate.mineurs} mineurs` : ""}
              </p>
            )
          )}
        </div>
      )}

      {Object.keys(jour.par_assemblee).length > 0 && (
        <p className="repartition">
          {Object.entries(jour.par_assemblee).map(([a, n]) => (
            <span key={a} className="puce statique">{a} : <b>{n}</b></span>
          ))}
        </p>
      )}
      {competences.length > 0 && (
        <p className="repartition">
          {competences.map(([c, n]) => (
            <span key={c} className="puce statique">{c} : <b>{n}</b></span>
          ))}
        </p>
      )}

      {equipe && (
        <>
          <div className="titre-section">
            <h3>Liste nominative</h3>
            {liste && liste.length > 0 && (
              <button
                className="bouton"
                onClick={async () => {
                  setCopie(await copier(message()));
                  setTimeout(() => setCopie(false), 2000);
                }}
              >
                {copie ? "Copié ✓" : "Copier le message WhatsApp"}
              </button>
            )}
            {saisie && liste && liste.length > 0 && (
              <Link className="bouton whatsapp" to={`/admin/messages?jour=${jour.jour}`}>
                Écrire aux volontaires de ce jour
              </Link>
            )}
          </div>
          {!liste ? (
            <p className="chargement">Chargement…</p>
          ) : liste.length === 0 ? (
            <p className="vide-msg">Personne n'est encore prévu ce jour-là.</p>
          ) : (
            <ol className="liste-jour">
              {liste.map((v) => (
                <li key={v.volontaire_id} className={v.en_reserve ? "reserve" : ""}>
                  <Link to={`/admin/volontaires/${v.volontaire_id}`}>{v.nom}</Link>
                  <span className="meta">
                    {v.assemblee}
                    {v.creneau !== "journee" && ` · ${LIBELLE_CRENEAU[v.creneau]}`}
                    {v.nb_mineurs > 0 && ` · +${v.nb_mineurs} mineur${v.nb_mineurs > 1 ? "s" : ""}`}
                    {v.est_mineur && " · inscrit mineur"}
                    {v.en_reserve && " · réserve"}
                  </span>
                  {v.competences.length > 0 && <span className="meta">{v.competences.join(", ")}</span>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
