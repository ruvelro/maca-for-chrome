# Roadmap

## Phase 1: Stabilize Documentation And Ops Baseline

- keep architecture and task docs current with code changes
- align README and browser docs with actual provider and feature scope
- standardize build/release procedure, especially Chrome packaging
- document or automate env bootstrap for Firefox signing

## Phase 2: Add Safety Nets

- extend the committed Node smoke tests into browser-level smoke tests for core flows
- add provider parsing coverage for major endpoints
- add a repeatable manual QA checklist to release flow

## Phase 3: Reduce Structural Risk

- shared browser source foundation is in place; continue shrinking generated/browser-specific surface
- continue splitting monolithic files into smaller modules
- finish isolating WordPress selectors and provider adapters into dedicated modules
- expand MV3 restart recovery from auto-upload state to all in-flight job types

## Phase 4: Product Evolution

- only after baseline and safety nets are stable
- possible targets:
  - richer observability
  - stronger QA workflows
  - better release tooling
  - controlled feature expansion

## Roadmap Guardrails

- no rewrite proposal without hard evidence from the codebase
- prioritize incremental hardening over architecture reset
