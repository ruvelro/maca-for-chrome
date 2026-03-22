# Auto Upload

## Confirmed

- watches WordPress upload activity through:
  - file input change
  - drop
  - paste
  - DOM mutation signals
- identifies newly uploaded attachments
- queues processing per tab
- shows floating progress UI
- supports:
  - pause
  - resume
  - cancel
- has a configurable safety fuse for large queues
- can optionally deselect processed items after fill

## Trigger Rules

Confirmed by code:

- feature is gated by settings
- logic distinguishes recent upload sessions from normal selection behavior
- a separate option exists for auto-analyze on media selection

## Risks

- the flow is marked experimental in UI
- WordPress DOM timing and upload UI behavior are likely the main failure sources
