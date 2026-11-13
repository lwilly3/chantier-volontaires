#!/usr/bin/env python3
"""Publie une nouvelle version de l'application.

    python3 scripts/publier_version.py 1.2.0       # numéro explicite
    python3 scripts/publier_version.py correctif   # 1.1.0 → 1.1.1  (corrections)
    python3 scripts/publier_version.py mineure     # 1.1.0 → 1.2.0  (nouveautés)
    python3 scripts/publier_version.py majeure     # 1.1.0 → 2.0.0  (changement incompatible)

Le script met à jour le numéro (API + front), date la section « Non publié » de CHANGELOG.md,
crée le commit « Version X.Y.Z » et l'étiquette git `vX.Y.Z`. Rien n'est envoyé sur GitHub :
la commande d'envoi est affichée à la fin.

Utilisé aussi par l'intégration continue :
    --verifier [vX.Y.Z]   vérifie que les numéros concordent (et correspondent à l'étiquette)
    --notes X.Y.Z         affiche les notes de cette version tirées de CHANGELOG.md
"""

from __future__ import annotations

import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIER_API = RACINE / "backend" / "app" / "version.py"
PAQUET_FRONT = RACINE / "frontend" / "package.json"
VERROU_FRONT = RACINE / "frontend" / "package-lock.json"
JOURNAL = RACINE / "CHANGELOG.md"

MOTIF_VERSION = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
MOTIF_API = re.compile(r'^__version__ = "([^"]+)"$', re.M)
TITRE_NON_PUBLIE = "## Non publié"
NIVEAUX = {"majeure": 0, "mineure": 1, "correctif": 2}


def arret(message: str) -> None:
    sys.exit(f"✗ {message}")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=RACINE, check=True, capture_output=True, text=True).stdout.strip()


def version_api() -> str:
    trouve = MOTIF_API.search(FICHIER_API.read_text(encoding="utf-8"))
    if not trouve:
        arret(f"__version__ introuvable dans {FICHIER_API.relative_to(RACINE)}")
    return trouve.group(1)


def version_front() -> str:
    return json.loads(PAQUET_FRONT.read_text(encoding="utf-8"))["version"]


def triplet(version: str) -> tuple[int, int, int]:
    trouve = MOTIF_VERSION.match(version)
    if not trouve:
        arret(f"« {version} » n'est pas un numéro de version X.Y.Z")
    return tuple(int(n) for n in trouve.groups())  # type: ignore[return-value]


def notes(version: str) -> str:
    """Contenu de la section `## [version]` du journal des modifications."""
    lignes = JOURNAL.read_text(encoding="utf-8").splitlines()
    debut = next((i for i, l in enumerate(lignes) if l.startswith(f"## [{version}]")), None)
    if debut is None:
        arret(f"Pas de section « ## [{version}] » dans CHANGELOG.md")
    fin = next((i for i in range(debut + 1, len(lignes)) if lignes[i].startswith("## ")), len(lignes))
    return "\n".join(lignes[debut + 1 : fin]).strip()


def verifier(etiquette: str | None) -> None:
    api, front = version_api(), version_front()
    if api != front:
        arret(f"Numéros différents : API {api}, front {front}")
    if etiquette and etiquette != f"v{api}":
        arret(f"L'étiquette {etiquette} ne correspond pas à la version {api} du code")
    if etiquette:
        notes(api)
    print(f"✓ Version {api} cohérente")


def ecrire_numero(version: str) -> None:
    texte = FICHIER_API.read_text(encoding="utf-8")
    FICHIER_API.write_text(MOTIF_API.sub(f'__version__ = "{version}"', texte), encoding="utf-8")

    # Remplacement ciblé pour conserver la mise en forme des fichiers npm
    for fichier, occurrences in ((PAQUET_FRONT, 1), (VERROU_FRONT, 2)):
        if not fichier.exists():
            continue
        texte = fichier.read_text(encoding="utf-8")
        texte, n = re.subn(r'("version": ")[^"]+(")', rf"\g<1>{version}\g<2>", texte, count=occurrences)
        if n != occurrences:
            arret(f"Champ version introuvable dans {fichier.relative_to(RACINE)}")
        fichier.write_text(texte, encoding="utf-8")


def dater_journal(version: str) -> None:
    texte = JOURNAL.read_text(encoding="utf-8")
    if f"## [{version}]" in texte:
        return  # section déjà rédigée à la main
    if TITRE_NON_PUBLIE not in texte:
        arret(f"Section « {TITRE_NON_PUBLIE} » absente de CHANGELOG.md")
    jour = datetime.date.today().isoformat()
    JOURNAL.write_text(
        texte.replace(TITRE_NON_PUBLIE, f"{TITRE_NON_PUBLIE}\n\n## [{version}] — {jour}", 1), encoding="utf-8"
    )
    if not notes(version):
        arret(
            f"La section « {TITRE_NON_PUBLIE} » de CHANGELOG.md est vide : décris d'abord ce qui change.\n"
            "  (annuler les modifications du script : git checkout -- .)"
        )


def publier(demande: str) -> None:
    actuelle = version_api()
    if actuelle != version_front():
        arret(f"Numéros différents avant publication : API {actuelle}, front {version_front()}")

    if demande in NIVEAUX:
        nombres = list(triplet(actuelle))
        rang = NIVEAUX[demande]
        nombres[rang] += 1
        nombres[rang + 1 :] = [0] * (2 - rang)
        version = ".".join(map(str, nombres))
    else:
        version = demande
        if triplet(version) < triplet(actuelle):
            arret(f"{version} est antérieure à la version actuelle {actuelle}")

    etiquette = f"v{version}"
    if git("status", "--porcelain"):
        arret("Des modifications ne sont pas enregistrées : fais d'abord ton commit (git status).")
    if git("branch", "--show-current") != "main":
        arret("Une version se publie depuis la branche main.")
    if git("tag", "--list", etiquette):
        arret(f"L'étiquette {etiquette} existe déjà.")

    ecrire_numero(version)
    dater_journal(version)
    git("add", "-A")
    git("commit", "--allow-empty", "-m", f"Version {version}")
    git("tag", "-a", etiquette, "-m", f"Version {version}")

    print(f"✓ Version {version} prête (commit + étiquette {etiquette}).")
    print("  Pour la publier sur GitHub :")
    print("      git push origin main --follow-tags")
    print(f"  Pour annuler avant l'envoi : git tag -d {etiquette} && git reset --hard HEAD~1")


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
    elif args[0] == "--verifier":
        verifier(args[1] if len(args) > 1 else None)
    elif args[0] == "--notes" and len(args) == 2:
        print(notes(args[1].removeprefix("v")))
    elif len(args) == 1:
        publier(args[0].removeprefix("v"))
    else:
        arret("Arguments non reconnus (voir --help)")


if __name__ == "__main__":
    main()
