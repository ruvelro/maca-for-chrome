# Done

- `AUD-001` Initial repository audit and documentation baseline completed on `2026-03-14`.
  - Created `AGENTS.md` and the base docs set under `docs/`.
  - Reconstructed architecture, features, data flow, integrations, setup, testing state, debt, and roadmap from the current code.
  - Logged major risks:
    - no automated tests
    - duplicated browser source trees
    - packaging inconsistency
    - Firefox signing env bootstrap gap

- `ARCH-001a` Shared-source foundation landed on `2026-03-21`.
  - Added `src/shared/` as the canonical extension source.
  - Added `src/platform/chrome/` and `src/platform/firefox/` wrappers.
  - Added shared build generation and the first committed Chrome packaging helper.

- `ARCH-002a` Provider adapters extracted on `2026-03-21`.
  - Added provider-specific modules under `src/shared/providers/`.
  - Reduced provider branching inside `src/shared/background.js`.
