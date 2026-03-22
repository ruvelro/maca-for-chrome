# Batch Processing

## Confirmed

- available from overlay UI
- background queries selected attachments from the WordPress media library
- each selected item is analyzed one by one
- overlay receives progress messages
- user can cancel in progress
- optional QA gate prevents auto-apply below a chosen threshold
- optional signature append can be applied during auto-fill paths

## Dependencies

- reliable attachment selection detection in WordPress DOM
- working provider config
- visible/applicable media fields when auto-apply is enabled

## Risks

- no automated regression coverage
- selector drift in WordPress can break selection or apply path
