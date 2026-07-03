# ENTRAIN TradJS Server v0.13

Server-backed ENTRAIN with a first-class **pattern format**, database-backed **ready brainwave soundtracks**, a free editor, wallet-saved private library, Phantom/SPL-token gates, and a publish-time protocol analyzer.



## v0.11 token/market pass

This build aligns the app with the token ticker now being **$WAVES** while keeping older `ENTRAIN_MINT` deployments compatible.

- Added centralized token config:
  - `TOKEN_TICKER` defaults to `WAVES`.
  - `TOKEN_DISPLAY_NAME` defaults to `$WAVES`.
  - `TOKEN_CHAIN` defaults to `solana`.
  - `TOKEN_MINT` is the canonical mint env var; `ENTRAIN_MINT` remains a backward-compatible alias.
- Added token APIs:
  - `GET /api/token/config` returns ticker/chain/mint metadata for client UI.
  - `GET /api/token/market` returns a cached DexScreener market snapshot with market cap, FDV, price, liquidity, 24h volume/change, and best pair URL.
- Homepage now includes a live `$WAVES` market/gate card that refreshes every 5 seconds in the browser.
- Wallet and gate labels now read from token config instead of hardcoding `$ENTRAIN`.
- Phantom signed-message copy now says it checks the configured token balance rather than a fixed ticker.

## Stack

- TradJS app routes and API routes.
- `tradjs/client` browser mounts; no React app shell.
- `sqlite-zod-orm` database with Zod-backed tables.
- `measure-fn` scopes around DB/auth/RPC operations.
- Phantom signed-message login and server-side SPL token balance gates.
- Local Web Audio playback/export; no generated audio or ambience files are uploaded.

## Run

```bash
bun install
cp .env.example .env
bun run seed
bun run dev
```

Open `http://localhost:3000`.

## Product model

The product unit is a **playable pattern row**:

```txt
soundtrack row = public metadata + minTokens gate + entrain.session.v1 JSON + analysis/safety metadata
saved session row = wallet owner + private metadata + entrain.session.v1 JSON
```

The browser player understands the same `entrain.session.v1` object everywhere:

- `/studio` creates and plays custom tracks for free.
- `/studio` can export JSON, compact pattern text, share a URL hash, and render WAV locally without login.
- Saving to `/library` requires Phantom authorization, but does not require a token threshold.
- `/soundtracks` lists prepared database rows as ready brainwave soundtracks.
- `/soundtracks/[slug]` can play continuously, render an exact length, render N repetitions, clone to editor, or clone into the private library.
- Gated prepared rows require `wallet.balance >= row.minTokens` before the server returns playable session JSON.
- `/admin` manages prepared soundtrack rows and can publish/draft/archive them.

## What is new in v0.5

- Added `src/format/protocol-analyzer.ts`.
  - Flags binaural layers that need headphones.
  - Warns/errors on binaural fusion ceiling violations above 30 Hz.
  - Warns on questionable binaural carrier ranges.
  - Estimates peak/RMS headroom before the limiter.
  - Detects local ambience files and native sample-loop click risk.
  - Scans public copy for medical/guaranteed/supernatural claim-risk terms.
- Added session-level loop semantics:
  - `hold-last` for descents.
  - `repeat` for short cyclic patterns.
  - `crossfade-repeat` metadata for loop-oriented soundtracks.
- Added serializable procedural ambience layers:
  - `rain`
  - `pink-rain`
  - `brown-room`
  - `bowl-drone`
- Added compact pattern text import/export in Studio for power-user/admin authoring.
- Admin publish pipeline now blocks publishing if the analyzer finds hard protocol errors or risky public claims. Draft saves are still allowed.
- Prepared rows now store analysis/safety metadata, evidence level, headphone requirement, default loop mode, and default export length.
- Seed soundtracks were renamed away from commercial-template framing into product-ready names:
  - `Mind Awake Body Rest`
  - `Expanded Awareness Stack`
  - `Deep Descent 60`

## Database tables

`src/lib/db.ts` defines:

- `templates` — compatibility table name for prepared soundtrack rows.
- `savedSessions` — private wallet library rows.
- `walletChallenges` — Phantom signed-message nonces.
- `walletSessions` — verified wallet sessions with cached SPL token balance.
- `playEvents` — lightweight activity log for access/save/clone events.

A production migration can rename `templates` to `soundtracks`; the app layer already calls these records soundtracks.

## ENTRAIN session format

```ts
{
  format: 'entrain.session.v1',
  name: string,
  durationMin: number,
  description?: string,
  notes?: string,
  loop?: { mode: 'repeat' | 'hold-last' | 'crossfade-repeat', crossfadeSec?: number },
  export?: { fadeSec?: number, sampleRate?: 32000 | 44100 | 48000 },
  layers: [
    {
      id: string,
      type: 'binaural' | 'monaural' | 'iso-smooth' | 'iso-hard' | 'carrier' | 'noise' | 'sample' | 'procedural-ambience',
      carrierHz?: number,
      wave?: 'sine' | 'triangle' | 'sawtooth',
      noiseColor?: 'white' | 'pink' | 'brown',
      ambienceRecipe?: 'rain' | 'pink-rain' | 'brown-room' | 'bowl-drone',
      seed?: number,
      pan?: number,
      panMotion?: { rateHz: number, depth: number },
      sampleName?: string,
      sampleLoop?: { mode: 'native' | 'crossfade', startSec?: number, endSec?: number, crossfadeSec?: number },
      keyframes: [{ tMin: number, beatHz?: number, gainPct: number }]
    }
  ]
}
```

Binaural layers intentionally ignore pan and pan motion. Panning them would bleed each ear’s carrier into the other and break the interaural offset that creates the beat.

## Compact pattern text

Studio can copy/import a lightweight authoring format:

```txt
name "Mind Awake Body Rest"
duration 35m
loop hold-last
binaural carrier=100 beat=1.5 gain=-34dB
binaural carrier=200 beat=4 gain=-36dB
ambience recipe=pink-rain gain=-18dB seed=1010
```

The canonical stored format remains `entrain.session.v1` JSON.

## Token gates

The client asks Phantom to sign a nonce. The server verifies the ed25519 signature, reads the configured SPL token balance, writes a short-lived HTTP-only session in SQLite, then serves gated soundtrack JSON through `/api/access?slug=...` only when `balance >= minTokens`.

Set `ALLOW_DEV_UNLOCK=1` in `.env` for local UI work without a token balance.

## Admin workflow

1. Design a track in `/studio`.
2. Click **Admin draft**.
3. Open `/admin` and click **Use current editor session**.
4. Add slug, title, description, tags, token gate, and status.
5. Review the analyzer card.
6. Save as draft or publish.

Publishing is blocked when hard protocol errors or claim-risk terms are present. Save as draft while iterating.

For production, replace the `ADMIN_TOKEN` scaffold with a wallet-role or server-side admin-account check.

## Ambience files

Ambience files are decoded into runtime-only `AudioBuffer`s. JSON, saved sessions, and share URLs preserve filenames and loop settings only. After loading a shared/saved session, reload the local audio file before playback/export.

Use procedural ambience layers for prepared soundtracks that must be fully portable without external audio assets.


## v0.6 protocol-audit patch

This build tightens the three report-inspired prepared soundtracks against the comparison table and synthesis specs:

- `Deep Descent 60`: one 140 Hz binaural carrier, 10 → 2.5 Hz over minutes 0–30 and 2.5 → 1.5 Hz over minutes 30–60, with rain plus bowl-drone masking.
- `Mind Awake Body Rest`: 35 minutes, two static binaural layers — 100 Hz / 1.5 Hz and 200 Hz / 4.0 Hz — plus continuous pink noise.
- `Expanded Awareness Stack`: 35 minutes, 100 Hz / 1.5 Hz, 200 Hz / 4.0 Hz, 250 Hz / 10 → 10.1 Hz fade-in, and 300 Hz / 4.8 Hz fade-in, plus continuous pink noise. The fade-in layers now reach target gain at minute 1, matching the report’s 60-second synthesis model.

The prepared rows are still described as report-aligned / inspired rather than exact commercial copies. The procedural ambience recipes are portable JSON substitutes for copyrighted or local recordings.


## v0.7 accuracy pass

- Added explicit disclosure text to the Focus-10-style and Focus-12-style seed descriptions when the stored pattern is a curated/simplified reconstruction rather than an exact historical tape clone.
- Added `Dense Expanded Awareness Stack`, a separate Focus-12-style higher-carrier variant using the report-noted bridge carriers `400[10.0]`, `500[10.1]`, and `600[4.8]`.
- Kept `Expanded Awareness Stack` as the more comfortable lower-carrier curated version using `250[10.0→10.1]` and `300[4.8]`.
- Reminder: `seedIfNeeded()` does not overwrite an existing local database. Delete the local DB or update rows through `/admin` to see seed changes in an already-running install.

## v0.8 reference-lineage pass

This pass makes the “is this implemented correctly?” question first-class data instead of buried description text.

- Added `src/format/protocol-reference.ts`:
  - Named reference specs for `core-focus-10`, `dense-focus-10`, `curated-focus-12`, `dense-focus-12`, and `deep-descent-60`.
  - `compareToReference(session, referenceId)` checks duration, carrier map, beat keyframes, masks/ambience, and intentional extra/missing layers.
- Added per-row lineage metadata:
  - `lineage.accuracy`: `exact-to-report`, `curated-reconstruction`, `historical-variant`, or `inspired`.
  - `lineage.referenceId`: which reference spec the row claims to match.
  - `lineage.disclosure` and `lineage.intentionalDifferences`: public description of known deviations.
- Added database fields:
  - `lineageJson`
  - `referenceMatchJson`
  - `seedRevision`
- Soundtrack detail pages now show:
  - lineage / accuracy label
  - source disclosure
  - intentional differences
  - reference-match score and deviations
- Admin now has a Reference Spec selector and lineage JSON editor. It previews the reference comparison before publishing.
- Added `Dense Mind Awake Body Rest`, the Focus-10-style four-carrier variant: `100[1.5]`, `200[4.0]`, `250[4.0]`, `300[4.0]` over pink noise.
- Added an idempotent built-in soundtrack sync command:

```bash
bun run sync:soundtracks
```

Use this after upgrading an existing local DB. Unlike `seed`, it upserts the built-in soundtrack rows and refreshes descriptions, lineage metadata, reference match data, and seed revisions without deleting user library rows.


## v0.9 signal-map / entitlement-hardening pass

This pass turns the “is this pattern mathematically correct?” check into a visible product feature and closes an access leak in the public soundtrack page.

- Added `src/format/channel-map.ts`.
  - Computes the exact signal map from any `entrain.session.v1` object.
  - Shows `left = carrier - beat/2` and `right = carrier + beat/2` for binaural/monaural layers.
  - Shows carrier/LFO points for isochronic layers and gain dB for every layer.
- Soundtrack detail pages now avoid leaking exact locked patterns.
  - Free rows show their full signal map publicly.
  - Gated rows show metadata, lineage, and analyzer summary, but exact layer/keyframe maps appear only after the user unlocks the player through Phantom/token access.
- The unlocked soundtrack player now displays the computed left/right frequency map after access is granted.
- Admin now shows a computed signal map while editing a row, so the publisher can verify arithmetic before saving.
- Publishing now blocks declared-reference mismatches. If a row claims a reference spec, the stored pattern must match that spec or stay in draft.
- Added a built-in regression command:

```bash
bun run audit:soundtracks
bun run audit:soundtracks -- --signals
```

The audit checks all built-in rows for analyzer hard errors and declared reference mismatches, and can print the computed signal maps for review.

## v0.10 admin audit / publish-integrity pass

This pass turns the correctness work into an operational dashboard for prepared soundtrack rows.

- Added `src/lib/audit-report.ts` as the shared audit engine.
  - Recomputes analyzer output from stored `entrain.session.v1` JSON.
  - Recomputes declared reference-spec match.
  - Recomputes pattern hash and detects stale stored hashes.
  - Checks whether stored `analysisJson` / `referenceMatchJson` drifted from the current analyzer implementation.
  - Re-runs the public-copy claim-risk scanner.
  - Can include full computed signal maps for admin use.
- Added admin API:

```bash
GET /api/admin/audit
GET /api/admin/audit?signals=1
```

  Both require the same `ADMIN_TOKEN` scaffold as the soundtrack manager.

- Added admin dashboard:

```bash
/admin/audit
```

  It summarizes row counts, OK/warn/fail status, gates, pattern hashes, declared reference status, analyzer issues, claim-risk hits, and optional signal maps.

- Added database audit CLI:

```bash
bun run audit:db
bun run audit:db -- --signals
bun run audit:db -- --json
```

- Reworked the built-in audit CLI to use the same shared audit engine:

```bash
bun run audit:soundtracks
bun run audit:soundtracks -- --signals
bun run audit:soundtracks -- --json
```

- Updated built-in seed revision to `builtin-v10-admin-audit` so `bun run sync:soundtracks` can refresh row metadata cleanly on existing local databases.

Recommended upgrade check:

```bash
bun install
cp .env.example .env
bun run sync:soundtracks
bun run audit:soundtracks
bun run audit:db
bun run dev
```


## v0.12 — group synced listening

This version adds hostable synchronized listening rooms for prepared soundtracks. A listener can create a room from a soundtrack page, copy a share link, and everyone who opens the link can unlock the same gated soundtrack pattern and click **Join synced listening**. The server stores only room timing metadata, not rendered audio. Playback remains local in the browser.

New pieces:

- `syncRooms` SQLite table for ephemeral rooms.
- `src/lib/sync-rooms.ts` for room creation, public room state, and host controls.
- `POST /api/sync/rooms` to create a room.
- `GET /api/sync/rooms/[roomId]` to read server-time room state.
- `POST /api/sync/rooms/[roomId]/control` for host `start`, `pause`, and `stop`.
- Soundtrack player UI now has a **Group listening** card with room creation, room share links, synced join/resync, and host controls.
- Client audio engine can start from a pattern offset, so late joiners begin at the same soundtrack position rather than from the beginning.

Important limitation: Web Audio oscillator phase is not guaranteed identical between devices, and browser autoplay rules require every listener to click before audio begins. The synchronization target is soundtrack position and timing, not sample-identical phase across machines.


## v0.12 group synced listening

- Added database-backed sync rooms.
- Soundtrack pages can create/share a room link.
- Host controls can start, pause, and stop room playback.
- Late joiners calculate the current soundtrack offset from server time and start locally at the correct position.

## v0.13 sync accuracy and room presence pass

This pass upgrades group listening from a simple room timer into a more usable listen-party system:

- Added `GET /api/sync/clock` for browser/server clock calibration.
- Added room presence heartbeats with `syncRoomPresence` rows.
- Soundtrack room cards now show listener count, host presence, and participant labels.
- Host can use **Cue 10s start** so everyone sees/hears a shared countdown instead of an abrupt immediate start.
- Client playback supports scheduled starts with `delaySec`, so users who joined before the countdown can be armed ahead of time.
- Client engine exposes `positionSec()` so the synced listener can detect drift.
- Room polling performs coarse drift correction by re-syncing when a tab has drifted too far from the server-time position.
- Presence is best-effort and expires automatically after short inactivity; audio generation remains local in each browser.

Limitations: browser autoplay policy still requires a user click, network jitter still exists, and oscillator phase is not guaranteed sample-identical across devices. The feature syncs timeline position well enough for communal listening, not metrology-grade audio phase.
