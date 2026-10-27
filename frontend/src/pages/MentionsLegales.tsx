import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { versDate } from "../lib/dates";
import { Ecran } from "./Inscription";

interface Infos {
  nom_chantier: string;
  assemblees: string[];
  date_fin: string;
  responsable_donnees: string;
  contact: string;
}

export const VERSION_MENTIONS = "27 octobre 2026";

/** Mentions légales et protection des données — en langage simple. */
export default function MentionsLegales() {
  const [infos, setInfos] = useState<Infos | null>(null);
  useEffect(() => {
    api<Infos>("/api/public/mentions").then(setInfos).catch(() => {});
  }, []);

  const responsable = infos?.responsable_donnees || "le responsable du service volontaires du chantier";
  const finChantier = infos?.date_fin
    ? versDate(infos.date_fin).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <Ecran titre="Mentions légales et données personnelles">
      <article className="carte mentions">
        <p className="chapeau">
          En bref : <b>Volontaires</b> est un outil bénévole qui sert uniquement à organiser les volontaires d'un
          chantier de rénovation de Salle du Royaume. Tes informations ne servent à rien d'autre, ne sont ni vendues ni
          partagées, et seront effacées à la fin du chantier.
        </p>

        <h2>1. À quoi sert ce site</h2>
        <p>
          Ce site aide le service volontaires du chantier
          {infos?.nom_chantier ? <> « {infos.nom_chantier} »</> : null}
          {infos?.assemblees?.length ? <> ({infos.assemblees.join(", ")})</> : null} à savoir qui vient, quel jour, avec
          quelles compétences, afin de bien répartir les volontaires, de respecter le nombre maximum de personnes par
          jour pour la sécurité, d'envoyer les rappels et de prévoir les repas.
        </p>

        <h2>2. Un projet indépendant</h2>
        <p>
          Ce site est une initiative de volontaires locaux, réalisée bénévolement. <b>Il n'est ni édité, ni approuvé,
          ni financé, ni administré par la Watch Tower Bible and Tract Society of Pennsylvania</b>, ni par aucune
          organisation qui lui est liée. Celles-ci ne sont pas responsables de son contenu ni de son fonctionnement.
          Les responsables du chantier qui l'utilisent en sont seuls responsables.
        </p>

        <h2>3. Qui est responsable de tes données</h2>
        <p>
          <b>{responsable}</b>
          {infos?.contact ? <> — contact : {infos.contact}</> : null}. C'est à cette personne que tu peux poser tes
          questions ou adresser tes demandes.
        </p>

        <h2>4. Les informations demandées</h2>
        <ul>
          <li>ton nom et ton numéro WhatsApp ;</li>
          <li>ton assemblée et tes compétences ;</li>
          <li>les jours et moments où tu es disponible ;</li>
          <li>le nombre de mineurs à ta charge qui pourraient t'accompagner (aucun nom) ;</li>
          <li>une remarque si tu le souhaites.</li>
        </ul>
        <p>Seuls les adultes peuvent s'inscrire. Ne donne que ce qui est utile à l'organisation du chantier.</p>

        <h2>5. Pourquoi elles sont utilisées</h2>
        <p>
          <b>Uniquement pour organiser les volontaires pendant le chantier</b> : planning des jours, rappels et messages
          sur WhatsApp, prévision des repas, sécurité sur le chantier. Elles ne sont jamais vendues, louées, utilisées
          pour de la publicité ni transmises à d'autres personnes ou organisations.
        </p>

        <h2>6. Qui peut les voir</h2>
        <ul>
          <li>le responsable du service volontaires et ses adjoints ;</li>
          <li>les « hommes clés » désignés, pour inscrire et prévenir les volontaires ;</li>
          <li>
            la cuisine et le comité de coordination voient <b>seulement des chiffres</b> (combien de personnes par
            jour), jamais les noms ni les numéros.
          </li>
        </ul>
        <p>Chaque personne de l'équipe a son propre accès protégé par un mot de passe.</p>

        <h2>7. Ton accord</h2>
        <p>
          En t'inscrivant, tu acceptes que les informations que tu donnes soient utilisées pour les besoins du chantier
          par le responsable ou les personnes qu'il a autorisées, comme décrit ici. Si un membre de l'équipe t'inscrit
          lui-même (par exemple si tu n'as pas de smartphone), il le fait avec ton accord.
        </p>

        <h2>8. Combien de temps elles sont gardées</h2>
        <p>
          Pendant la durée du chantier{finChantier ? <> (fin prévue le {finChantier})</> : null}. À la fin, le
          responsable <b>efface toutes les données personnelles</b>, ou les rend anonymes pour ne garder que des chiffres
          (par exemple : « 42 volontaires le samedi »). L'application prévoit une fonction dédiée pour cela. Les copies
          de sauvegarde techniques sont supprimées à leur tour.
        </p>

        <h2>9. Tes droits</h2>
        <ul>
          <li>voir et modifier tes informations et tes jours à tout moment grâce à ton lien personnel ;</li>
          <li>te retirer d'un jour ou de tout le chantier ;</li>
          <li>demander que tes informations soient effacées, en t'adressant au responsable (point 3).</li>
        </ul>

        <h2>10. Hébergement et sécurité</h2>
        <p>
          Les pages du site sont servies par Cloudflare. Les données sont enregistrées sur un serveur privé géré par le
          responsable du projet. Les échanges sont chiffrés (HTTPS), les mots de passe de l'équipe sont stockés de façon
          illisible et l'accès au formulaire peut être protégé par un code.
        </p>

        <h2>11. Cookies</h2>
        <p>
          Aucun cookie publicitaire ni outil de mesure d'audience. Ton navigateur garde seulement ce qui est nécessaire au
          fonctionnement : ton lien personnel, ta session si tu fais partie de l'équipe, l'affichage de certaines pages.
        </p>

        <h2>12. Logiciel libre</h2>
        <p>
          Le code de l'application « Volontaires » est appelé à être publié en accès libre, sous licence libre, afin que
          d'autres chantiers puissent l'utiliser. Chaque équipe qui l'installe est seule responsable de son utilisation et
          des données qu'elle collecte.
        </p>

        <p className="aide">Dernière mise à jour : {VERSION_MENTIONS}.</p>
        <p>
          <Link to="/">← Retour au formulaire</Link>
        </p>
      </article>
    </Ecran>
  );
}
