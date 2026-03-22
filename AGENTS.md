# AGENTS.md

## Purpose

This repository contains the current working codebase for `maca`, a browser extension for WordPress media metadata generation with AI.

This file is the operational entrypoint for any agent working in this repo.

## Source Of Truth

1. Source of truth is the code in the repository.
2. Existing documentation is valid only when it matches the code.
3. Every important claim should be tagged mentally as one of:
   - confirmed by code
   - reasonable inference
   - pending confirmation

## Current Repository Shape

- `README.md`
  - high level product and browser overview
- `maca por chrome/`
  - Chrome / Chromium extension source
- `maca for firefox/`
  - Firefox extension source
- `scripts/`
  - Firefox build and signing helpers present in the current workspace
- `dist/`
  - generated Firefox artifacts
- root packaged artifacts
  - browser release zips/xpi snapshots

There is no committed package manager manifest, no build system, and no automated test suite in the repo snapshot audited on 2026-03-14.

Git status during audit also showed local workspace additions outside the committed baseline, including `scripts/` and `.gitignore`.

## Working Rules

1. Audit before redesign.
2. Do not invent product behavior not supported by code, config, tests, or docs that match code.
3. Update docs and task files together with any relevant discovery.
4. Convert bugs, debt, unclear behavior, and missing docs into tracked tasks.
5. Prefer incremental improvement over rewrite unless the code state clearly justifies otherwise.
6. Treat Chrome and Firefox folders as separate deployable variants until a shared-source refactor is explicitly approved.

## Documentation Map

- `docs/project-overview.md`
- `docs/architecture.md`
- `docs/file-map.md`
- `docs/functions-map.md`
- `docs/data-flow.md`
- `docs/integrations.md`
- `docs/domain-glossary.md`
- `docs/setup-and-ops.md`
- `docs/testing.md`
- `docs/technical-debt.md`
- `docs/roadmap.md`
- `docs/features/`
- `docs/tasks/backlog.md`
- `docs/tasks/in-progress.md`
- `docs/tasks/done.md`
- `docs/decisions/architecture-decisions.md`
- `docs/history/change-log.md`

## Task System

- Pending work lives in `docs/tasks/backlog.md`
- Active work lives in `docs/tasks/in-progress.md`
- Completed work lives in `docs/tasks/done.md`

Any relevant finding should end up in docs or tasks, ideally both.

## Current Audit Status

Initial repository audit and documentation baseline completed on `2026-03-14`.

See:

- `docs/project-overview.md`
- `docs/technical-debt.md`
- `docs/tasks/backlog.md`
