# Share any game

## MVP card

- Player: anyone inviting friends to a Hopmodo game.
- Job: share the game itself through familiar platform entrances in the selected language.
- Risk: clip-sharing shortcuts do not expose game invitations; language can drift between the iframe, invitation and destination.
- Loop: choose a game → Share game → localized invitation → X/Instagram/Facebook/WhatsApp or native share/copy → friend opens the same game and language.
- Inputs: all nine playable games and the pointer concept, English/Chinese, mobile/desktop, clipboard available/blocked.
- Output: game URL and invitation only; no video, access token or private data.
- Proof: per-game entrance, selected-language text and URL, prefilled/copy boundaries, recipient language, cancellable accessible modal and unchanged play/replay.
- Boundary: no automatic posts/uploads, social authentication, platform SDK or new dependencies. Existing clip publication behavior stays intact.

## Implementation

Every playable game's shared HUD and illustrated introduction expose the same
invitation dialog. Game guides and Orbit Pop's concept page also expose it.
The dialog shares only `/play/<game>?lang=en|zh`. No clip UUID, viewer token,
management URL or camera media enters the invitation. A recipient starts in
the language selected when the link was shared and can change it normally.
The default public identity now points at `fitness.integ.life`; an explicit
`VITE_SITE_URL` still selects a separately hosted release.

X and WhatsApp receive the complete invitation in their destination URL.
Instagram, Facebook and LinkedIn start copying the invitation in the click
handler and open a separate tab for the player to paste/review/send. Instagram
does not pretend to prefill a post or publish media. Browser-native sharing is
available when supported; clipboard failure retains selectable text. Escape
closes the modal and restores focus to the actual entry/HUD/guide trigger.
Platform tabs use `noopener noreferrer`; existing clip publication is unchanged.

2026-10-03 checks: 139 shared unit tests, all nine builds, 14 game-invitation
browser cases, 12 guide cases and three responsive HUD/three entry lifecycle
cases passed. Platform destinations and native sharing use synthetic boundaries;
no social post is sent. Recipient language and blocked clipboard fallback are
verified in real Chrome, including fullscreen gameplay. Six existing clip-sharing
cases also passed. Two Forest wave/replay cases pass after integration, including
five recognized synthetic actions and decoded local replay.
