# Changelog

All notable changes to **wicked-vault** are documented here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions match
[npm](https://www.npmjs.com/package/wicked-vault?activeTab=versions).

## [0.7.0] — 2026-08-30

### Added
- **Evidence-manifest 2.1 twin sync**: `lib/manifest.mjs` + `schemas/evidence.json`
  accept wicked-ledger's manifest 2.1 (`scenario_evidence` block + `claim_level`
  enum) while 2.0 bundles stay valid; junk still rejects. Mirrors wicked-ledger's
  backward-compat semantics and unblocks vault-backed campaign evidence (TH-17).

### Changed
- Historical retired-product mentions annotated per the docs-lint scope (DT-22).

## [0.6.0] — earlier
See git history / npm for prior releases (README quickstart fixed in 0.6.x docs pass).
