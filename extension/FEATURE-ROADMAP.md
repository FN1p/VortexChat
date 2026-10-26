# VortexChat — standalone browser feature plan

All components are implemented independently by PFT Studio. No third-party chat relays, closed profile databases, or borrowed application assets.

## Included
- Native Twitch message formatting and emotes (7TV, BTTV, FFZ)
- User cards, bounded local history and highlight actions
- First-message (FM) badge and row accent when Twitch exposes a marker
- Quote message as an editable draft (never auto-send)
- Local hover preview and reader tools
- Player and appearance settings for Twitch and YouTube
- Russian and English extension metadata

## Next independent client-side modules
- Message context menu with stable hover and keyboard navigation
- Filtering / muted words and users with explicit local settings
- Per-channel appearance presets and optional notice controls
- More complete bilingual translation of live UI and toasts
- Quick moderation actions delegated to Twitch's native controls, respecting Twitch privileges
- Diagnostics screen showing whether features are active on the current Twitch page
- Browser-based tests covering DOM revisions and Twitch popout chat

## Excluded without separate user-approved infrastructure
- Third-party centralized chat databases, global shared ban services, remote account uploads
- Actions requiring unapproved tokens, credentials or privileged Twitch API access
- Automatic actions that send chat messages or moderate users without confirmation

Each module should carry regression tests, report its own degraded/fallback state, and be checked in a real browser before being called fully verified.
