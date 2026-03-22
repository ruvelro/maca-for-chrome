# Architecture Decisions

This file records current decisions reconstructed from the codebase.

## ADR-001: WordPress wp-admin is the only supported product surface

Status:

- confirmed by code

Evidence:

- host permissions target `wp-admin` and `wp-content`
- runtime guards reject non-WordPress pages

Implication:

- broader website support should be treated as a new product scope, not a small tweak

## ADR-002: AI generation is orchestrated centrally in background runtime

Status:

- confirmed by code

Evidence:

- provider calls, prompt assembly, validation, history, metrics, and queue state live in `background.js`

Implication:

- background runtime is the orchestration hub and current single point of complexity

## ADR-003: Browser settings use split persistence

Status:

- confirmed by code

Decision:

- most settings live in `storage.sync`
- API key may live in sync or local depending on user choice
- history/debug/metrics live in local storage

Implication:

- any future config migration must preserve storage split semantics

## ADR-004: Canonical source is shared, browser folders are generated outputs

Status:

- confirmed by current repo structure

Decision:

- canonical extension code lives in `src/shared/`
- browser-specific wrappers live in `src/platform/chrome/` and `src/platform/firefox/`
- `maca por chrome/` and `maca for firefox/` are generated from those sources for loading and packaging

Implication:

- direct edits should not happen in generated browser folders unless they are immediately backported to the shared source

## ADR-005: WordPress integration is selector-driven, not API-driven

Status:

- confirmed by code

Implication:

- selector maintenance is a first-class engineering concern
