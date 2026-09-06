#!/usr/bin/env python3
"""Narrow file-scope exceptions. Exit 0 defers to native permissions, never allows.

Only user-level additionalDirectories are considered; project files cannot
self-authorize access outside the checkout. No secrets are read or printed.
"""
import json
from pathlib import Path
import sys

ROLES = {'architect', 'builder', 'designer', 'devops', 'product-manager', 'qa', 'researcher', 'reviewer'}


def in_scope(kind, target, home):
    try:
        target, home = Path(target), Path(home)
        if kind == 'memory':
            root = home / '.claude/agent-memory'
            relative = target.relative_to(root)
            return (not root.is_symlink() and len(relative.parts) >= 2 and relative.parts[0] in ROLES
                    and target.suffix == '.md'
                    and target.resolve().is_relative_to(root.resolve())
                    and root.resolve().is_relative_to((home / '.claude').resolve()))
        if kind == 'additional':
            for filename in ('settings.json', 'settings.local.json'):
                settings = home / '.claude' / filename
                if not settings.is_file():
                    continue
                data = json.loads(settings.read_text())
                for directory in data.get('permissions', {}).get('additionalDirectories', []):
                    root = Path(directory).expanduser()
                    if root.is_absolute() and target.resolve().is_relative_to(root.resolve()):
                        return True
        return False
    except (OSError, ValueError, TypeError, RuntimeError):
        return False


if __name__ == '__main__':
    sys.exit(0 if len(sys.argv) == 4 and in_scope(*sys.argv[1:]) else 1)
