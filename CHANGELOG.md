# Changelog

All notable changes to **wicked-vault** are documented here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions match
[npm](https://www.npmjs.com/package/wicked-vault?activeTab=versions).

## [0.8.0] — 2026-10-10

### Fixed
- **Contract pins are enforced in full** (FND-VLT-01, #27): verifier params are pinned, and every
  current-contract pin is re-checked at cross-check.
- **Attestations are re-validated on every read** (FND-VLT-02, #28): hash, binding, opinion and
  evaluator. A corrupt record fails judgment gates closed.

### Added
- **Typed obligations** (FND-VLT-04, #29): cross-check reports `obligations` and
  `contract_satisfied`. The result fields are additive; `overall` and the exit code are unchanged.

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
