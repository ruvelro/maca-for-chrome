# Project Overview

## Executive Summary

`maca` is a Manifest V3 browser extension focused on `WordPress wp-admin`.

Confirmed by code:

- it analyzes images with AI
- it generates `alt`, `title`, and `leyenda`
- it supports manual runs, batch processing, and auto-processing after media uploads
- it can write generated values back into WordPress media fields
- it stores local history, debug logs, and metrics
- it ships as two browser-specific variants:
  - `maca por chrome/`
  - `maca for firefox/`

The current implementation is production-shaped but operationally fragile:

- no automated tests
- no shared source layer between browser variants
- large monolithic JS files
- packaging and release flow is only partially standardized

## Product Scope

Confirmed by code:

- target domain is WordPress admin pages only
- supported generation modes:
  - `both`
  - `alt`
  - `caption`
- supported providers:
  - OpenAI
  - Gemini
  - Anthropic
  - Groq
  - OpenRouter
  - local Ollama
  - local OpenAI-compatible endpoints

Reasonable inference:

- the product is intended for editorial workflows with SEO and accessibility constraints
- the team values operator control over fully autonomous generation

## Current Feature Inventory

Confirmed by code:

- context-menu analysis inside `wp-admin`
- keyboard shortcut analysis
- floating overlay with preview, edits, copy actions, SEO review, and regenerate styles
- direct apply to WordPress `alt`, `title`, and `caption` fields
- batch process selected attachments
- auto-process multiple uploaded attachments with pause/resume/cancel
- safety fuse for large auto-upload queues
- signature presets for captions
- session editorial context per tab
- history in popup
- config test in options page
- debug log copy/export helpers
- metrics collection and export
- config export/import
- Firefox build and sign scripts

## Documentation Reliability Snapshot

Existing docs before this audit:

- `README.md`
  - mostly aligned at product level
  - incomplete at architecture and operations level
- `maca por chrome/README.md`
  - useful for manual install
  - incomplete for real feature scope
- `maca for firefox/README.md`
  - useful for build/sign flow
  - incomplete for real feature scope

Known mismatches:

- browser-specific docs mention a narrower provider set than the code actually supports
- repo docs did not describe storage model, message bus, queue behavior, metrics, or task system

## Pending Confirmation

- whether both browser folders are expected to remain forked long term
- whether Chrome packaging has a canonical build script outside manual zip creation
- whether visible encoding drift in some Firefox-facing files is a source-file issue or only a terminal/rendering artifact
