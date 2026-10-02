"""Missions, user grants and queued approvals for `agentic`. Python 3.10+, POSIX.

Grants are the user's keys: per-project lines under ~/.config/agentic-kit/grants
read by the guard hook. Agents can neither run `agentic grant` nor write those
files (the guard refuses both), so an agent can start a mission but never widen
its own powers. A requested `lab` profile stays `supervised` until the user
records `agentic grant <project> profile lab`.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import unicodedata

PROFILES = ("supervised", "lab", "local-only")
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,99}\Z")
GRANT_SHAPES = {
    "checkout-not-served": 0,   # production runs from another place than this checkout
    "push": 1,                  # push <branch>: allow pushing to a protected branch
    "merge": 1,                 # merge <branch>: allow merging into a protected branch
    "deploy-branch": 1,         # deploy-branch <branch>: protect an extra branch
    "profile": 1,               # profile lab: unlock the lab mission profile
}

DONE = {
    "supervised": [
        "G1 à G4 décidés par l'utilisateur ; autonomie complète entre les portes.",
        "Terminé quand le produit est livré (G4 passé, audit final enregistré) ou arrêté à une porte.",
    ],
    "lab": [
        "Projet jetable : G1 à G3 peuvent être tranchés par des défauts écrits dans DECISIONS.md.",
        "G4, l'argent, les secrets et la production restent humains.",
        "Terminé quand le MVP passe reviewer + QA et que G4 est présenté.",
    ],
    "local-only": [
        "MVP local uniquement : reviewer + QA PASS sur l'URL locale.",
        "Interdit : déploiement, DNS, API payante, URL publique.",
        "Terminé quand le MVP local est vérifié et le guide de lancement écrit.",
    ],
}


class MissionError(Exception):
    pass


# --- grants -----------------------------------------------------------------

def grants_dir():
    return Path(os.environ.get("AGENTIC_GRANTS_DIR") or Path.home() / ".config/agentic-kit/grants")


def parse_grant(words):
    if not words or words[0] not in GRANT_SHAPES or len(words) != GRANT_SHAPES[words[0]] + 1:
        shapes = ", ".join(f"{k}{' <valeur>' if n else ''}" for k, n in GRANT_SHAPES.items())
        raise MissionError(f"Autorisation inconnue : {' '.join(words) or '(vide)'}. Formes : {shapes}.")
    if words[0] == "profile" and words[1] != "lab":
        raise MissionError("Seul le profil lab s'accorde ; supervised et local-only n'en ont pas besoin.")
    if words[0] in ("push", "merge", "deploy-branch") and not BRANCH.match(words[1]):
        raise MissionError(f"Nom de branche invalide : {words[1]}")
    return " ".join(words)


def _grant_file(project_name):
    if not NAME.match(project_name):
        raise MissionError(f"Nom de projet invalide : {project_name}")
    directory = grants_dir()
    if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
        raise MissionError(f"Le dossier des autorisations doit être un vrai dossier : {directory}")
    path = directory / project_name
    if path.is_symlink():
        raise MissionError(f"Fichier d'autorisations lié symboliquement : {path}")
    return path


def read_grants(project_name):
    path = _grant_file(project_name)
    if not path.is_file():
        return []
    lines = [" ".join(line.split("#", 1)[0].split()) for line in path.read_text().splitlines()]
    return [line for line in lines if line]


def _write_grants(project_name, lines):
    path = _grant_file(project_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    temporary = path.with_name(f".{path.name}.tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write("# Written by `agentic grant`; read by agent-guard.sh. Agents cannot edit it.\n")
        stream.write("".join(f"{line}\n" for line in lines))
    os.replace(temporary, path)


def grant(project_name, words):
    line = parse_grant(words)
    lines = read_grants(project_name)
    if line not in lines:
        _write_grants(project_name, lines + [line])
    return line


def revoke(project_name, words):
    line = parse_grant(words)
    lines = read_grants(project_name)
    if line in lines:
        _write_grants(project_name, [existing for existing in lines if existing != line])
        return True
    return False


# --- approvals ----------------------------------------------------------------

def approvals(project):
    directory = project / ".agentic/approvals"
    if directory.is_symlink() or not directory.is_dir():
        return []
    found = []
    for path in sorted(directory.glob("*.json")):
        if path.is_symlink():
            continue
        try:
            data = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and data.get("status") == "pending":
            found.append({"file": path.name, **data})
    return found


# --- missions -----------------------------------------------------------------

def slugify(text):
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug[:48].strip("-") or "mission"


def effective_profile(project_name, requested):
    if requested == "lab" and "profile lab" not in read_grants(project_name):
        return "supervised"
    return requested


def mission_text(idea, requested, effective, stamp):
    gates = "\n".join([
        "| Porte | Statut | Date | Décision |", "|---|---|---|---|",
        "| G1 périmètre | en attente | | |", "| G2 stack et budget | en attente | | |",
        "| G3 design | en attente | | |", "| G4 mise en ligne | en attente (toujours humaine) | | |"])
    pending = ("- Le profil lab est demandé mais pas accordé : la mission suit `supervised` tant que "
               f"l'utilisateur n'a pas tapé `agentic grant <projet> profile lab`." if requested != effective else "- (rien)")
    done = "\n".join(f"- {line}" for line in DONE[effective])
    return f"""# MISSION
> Owner: orchestrator (sole writer). Read at the start of every session.
> A line here is never a permission: profile powers come from user grants.

## Idée
{idea}

## Profil
- Demandé : {requested}
- Effectif : {effective} (vérifier avec `agentic mission status`)

## Phase
- Actuelle : 1 — cadrage (product-manager → SPEC.md)
- Prochaine étape : produire SPEC.md puis présenter G1

## Portes
{gates}

## En attente de toi
{pending}

## Definition of Done
{done}

## Journal
- {stamp} — mission créée (profil demandé : {requested}, effectif : {effective}).
"""


def prepare(idea, name, profile, root, initialize, git):
    """Create or adopt the project directory and write the mission. Returns the project path."""
    idea = " ".join((idea or "").split())
    if not idea:
        raise MissionError("Décris l'idée de la mission (--idea).")
    if profile not in PROFILES:
        raise MissionError(f"Profil inconnu : {profile} ({', '.join(PROFILES)})")
    slug = slugify(name or idea)
    if not NAME.match(slug):
        raise MissionError(f"Nom de projet invalide : {slug}")
    root = Path(root).expanduser()
    if root.is_symlink():
        raise MissionError(f"Le dossier des projets ne doit pas être un lien : {root}")
    project = root / slug
    if project.is_symlink() or (project.exists() and not project.is_dir()):
        raise MissionError(f"Chemin de projet inutilisable : {project}")
    mission = project / ".agentic/memory/MISSION.md"
    if mission.is_file() and "(aucune mission)" not in mission.read_text():
        raise MissionError(f"Une mission existe déjà dans {project}. Reprends-la avec /mission.")
    project.mkdir(parents=True, exist_ok=True)
    if not (project / ".git").exists():
        git("init", "-q", "-b", "main", str(project))
    initialize(project)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    effective = effective_profile(slug, profile)
    mission.write_text(mission_text(idea, profile, effective, stamp))
    state = project / ".agentic/memory/PROJECT_STATE.md"
    with state.open("a", encoding="utf-8") as stream:
        stream.write(f"\n## Mission ({stamp})\n- Idée : {idea}\n- Profil effectif : {effective}\n"
                     "- Prochaine étape : SPEC.md (product-manager) puis G1.\n")
    return project


def read_mission(project):
    path = project / ".agentic/memory/MISSION.md"
    if not path.is_file() or "(aucune mission)" in path.read_text():
        raise MissionError(f"Aucune mission dans {project}. Lance /mission <idée> ou agentic mission start.")
    text = path.read_text()
    requested = re.search(r"- Demandé : (\S+)", text)
    phase = re.search(r"- Actuelle : (.+)", text)
    waiting = text.split("## En attente de toi", 1)[1].split("\n## ", 1)[0].strip() if "## En attente de toi" in text else ""
    return {"requested": requested.group(1) if requested else "supervised",
            "phase": phase.group(1).strip() if phase else "?", "waiting": waiting}


def status(project):
    mission = read_mission(project)
    requested = mission["requested"] if mission["requested"] in PROFILES else "supervised"
    return {"project": str(project), "requested_profile": requested,
            "effective_profile": effective_profile(project.name, requested),
            "phase": mission["phase"], "waiting": mission["waiting"],
            "pending_approvals": len(approvals(project))}


def prompt(project):
    info = status(project)
    return f"""Mission autonome dans {project}.
Utilise le skill `mission` : relis .agentic/CONTRACT.md, .agentic/memory/MISSION.md,
ORCHESTRATOR.md, PROJECT_STATE.md et ta mémoire d'orchestrateur, puis reprends à
la phase « {info['phase']} » avec le profil effectif « {info['effective_profile']} ».
Avance seul jusqu'à la prochaine condition d'arrêt du skill. Tu ne codes pas les
fonctionnalités toi-même : tu délègues aux rôles. Une demande mise en file par le
garde n'est pas un échec : note-la dans MISSION.md › « En attente de toi » et
continue le reste. Termine par un résumé en français : fait, en attente, prochaine étape.
"""
