#!/usr/bin/env python3
"""Generate extension icons from wb-logo design by delegating to generate-icons.mjs."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MJS = ROOT / "scripts" / "generate-icons.mjs"


def main() -> None:
    res = subprocess.run(["node", str(MJS)], cwd=str(ROOT))
    sys.exit(res.returncode)


if __name__ == "__main__":
    main()
