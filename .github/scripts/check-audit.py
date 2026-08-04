#!/usr/bin/env python3
"""Fails only if `npm audit --json` reports a high/critical advisory that
isn't already in the accepted/documented list — new findings still block
the pipeline normally, known-and-accepted ones don't keep failing it forever.
"""

import json
import sys

# brace-expansion (CVE-2026-14257 / GHSA-mh99-v99m-4gvg and its mitigation-
# bypass follow-up GHSA-rgw5-rvv9-x895) is fixed via the root package.json
# `overrides` entry pinning the minimatch@3.1.5 instance to brace-expansion
# 1.1.18 — same 1.x API as before, no rewrite needed. No advisories accepted
# by default; add one here only with a comment explaining why it can't be
# fixed, same as .trivyignore.
ACCEPTED_ADVISORIES: set[str] = set()


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
