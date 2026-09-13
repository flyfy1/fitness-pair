# English and Simplified Chinese

## Delivery boundary

- Player: a visitor whose preferred browser language is Chinese or English.
- Job: understand the menu, game instructions, controls and replay/share flow.
- Risk: changing language could leave mixed UI, restart a game, or interrupt its recording.
- Loop: browser-language landing → illustrated guide → game → local replay → sharing controls; manual language choice persists across pages and refreshes.
- Proof: locale/catalog tests, full shared build, desktop/mobile browser checks and a synthetic recorded round with a mid-round language change.
- No-gos: third-party translation services, account-profile changes, automatic uploads, changes to recognition/scoring, additional languages or new dependencies.
- Appetite: one complete bilingual public arcade flow using the existing game hosts.

## Language selection

`packages/gameplay/locale.js` first uses an explicit `hopmodo.language` preference,
then the browser's first preferred language. Chinese language tags (including
regional variants) select Simplified Chinese; all other languages use English.
Automatic detection never writes a preference. The selector stores only `en` or
`zh` on this origin. Same-origin embedded games share the active choice with their
host, even if localStorage is blocked; reload persistence requires browser storage.
Other open tabs follow native storage notifications. Account synchronization is
outside this feature.

The main menu exposes a keyboard-accessible English / 简体中文 selector. The shared
game control panel owns the equivalent selector while playing. Standalone game
builds use the same helper. Changing language updates presentation and speech
without recreating game sessions, camera tracks or recording output streams.

## Translation ownership

`packages/gameplay/translations/zh-CN.json` contains records with stable semantic
`id`, exact English `en`, and Simplified Chinese `zh`. New copy should use a semantic
ID through `message(id, values)` or `data-i18n`. Existing independently owned hosts
use the shared DOM adapter to translate their English text and accessible labels
without replacing DOM elements or event handlers. It retains source text per node
so switching back restores the original, including dynamically interpolated text.
English source changes require the matching catalog entry to be updated.

Templates use numbered `{0}` slots; both languages must preserve the same slots.
The longest literal pattern wins. This is a compatibility adapter for these game
hosts, not machine translation. Unknown copy falls back to its original text.
`translateText` is also available for canvas labels. Flight's earlier dictionary
remains a fallback while its presentation uses the same site language preference.

Mark player-created content with `translate="no"`. Inputs, textareas, editable
content, code and explicit `data-no-i18n` sections are excluded. Never translate
player titles, email addresses, URLs or recordings. The replay button translates
its action while retaining the player's title verbatim. Dates follow the selected
locale. Login links pass an allowlisted `en` or `zh-CN` hint to Integ.Life Auth.

## Audio

Flight retains its existing bilingual countdown and encouragement pack. Jump Game
uses that same pack. Motion Quest uses the shared language-specific assets for its
start, encouragement and finish cues. Generic cues reuse existing speech with
appropriate wording; no new voice generation or remote speech request is needed.
Changing language cancels old-language speech and pending playback, retaining the
same mixed audio stream and native music/effects.

## Validation

Run `npm test`, `npm run build`, and the focused browser checks:

```sh
ARCADE_PORT=5392 npx playwright test --config apps/arcade/playwright.config.js apps/arcade/tests/languages.spec.js apps/arcade/tests/encouragement.spec.js
node --test apps/arcade/deploy/gcp/auth.test.mjs
```

These checks validate interface, preferences and synthetic gameplay/recording.
They do not establish human movement recognition accuracy. Player recordings and
user-authored titles remain in their original language. The separate legacy
`/highlights` experiment and third-party identity-provider implementation are not
part of the arcade's translation catalog.

## Reviewed evidence (2026-09-14)

- 84 shared/unit tests and 18 auth/server/resource tests pass.
- The bilingual browser suite and Flight voice suite pass (11 checks), including
  storage denial, explicit-choice persistence, 320/390 px menus, live language
  changes, Chinese countdown speech, a complete five-squat synthetic camera round,
  camera/worker cleanup, decoded replay audio and user-created title preservation.
- Three additional current English start/audio regressions pass.
- An older `recording-boundaries.spec.js` still requires a removed Motion Quest
  raised-hands start gate and therefore fails against the current product flow.
  That unrelated historical fixture was not rewritten. The current five-squat
  round is covered by `squat-start.spec.js` and `languages.spec.js` instead.
- Source and local-browser evidence does not by itself establish deployment;
  confirm the production `/healthz` commit and the public language flow separately.
