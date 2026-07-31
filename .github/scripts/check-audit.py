#!/usr/bin/env python3
"""Fails only if `npm audit --json` reports a high/critical advisory that
isn't already in the accepted/documented list — new findings still block
the pipeline normally, known-and-accepted ones don't keep failing it forever.
"""

import json
import sys

# GHSA-mh99-v99m-4gvg (CVE-2026-14257, brace-expansion): no fixed 1.x release
# exists, and forcing the only patched version (5.0.8, an incompatible
# rewrite) would break minimatch@3's glob matching — see .trivyignore for
# the full analysis. Never reachable with attacker-controlled input either
# way (internal temp-dir cleanup only), so accepted until an upstream fix
# for puppeteer-extra-plugin-user-data-dir exists.
ACCEPTED_ADVISORIES = {"GHSA-mh99-v99m-4gvg"}


def main() -> int:
    report_path = sys.argv[1] if len(sys.argv) > 1 else "audit.json"
    with open(report_path) as f:
        data = json.load(f)

    unexpected = []
    for name, vuln in data.get("vulnerabilities", {}).items():
        for via in vuln.get("via", []):
            if not isinstance(via, dict):
                continue
            advisory_id = via.get("url", "").rstrip("/").rsplit("/", 1)[-1]
            if advisory_id not in ACCEPTED_ADVISORIES:
                unexpected.append((name, advisory_id, via.get("title")))

    if unexpected:
        print("Nouvelles vulnérabilités high/critical non couvertes par une exception :")
        for name, advisory_id, title in unexpected:
            print(f"  - {name}: {advisory_id} — {title}")
        return 1

    print("Seules les vulnérabilités déjà documentées/acceptées sont présentes — OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
