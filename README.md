# ENTRAIN TradJS Server v0.3

Server-backed ENTRAIN Studio with first-class **brainwave soundtrack** rows, a free editor, wallet-saved private library, token-gated prepared soundtracks, and an admin manager.

## Stack

- TradJS app routes and API routes.
- `tradjs/client` browser mounts; no React app shell.
- `sqlite-zod-orm` database with Zod-backed tables.
- `measure-fn` scopes around DB/auth/RPC operations.
- Phantom signed-message login and server-side SPL token balance gates.
- Local Web Audio playback/export; no audio files are uploaded.

## Run

```bash
bun install
cp .env.example .env
bun run seed
bun run dev
```

Open `http://localhost:3000`.

## Product model

ENTRAIN stores each playable pattern as JSON in the database. A prepared public row is now presented as a **ready brainwave soundtrack**, not merely a template:

- `templates` table row = published soundtrack metadata + ENTRAIN session JSON + `minTokens` gate.
- `/soundtracks` = public catalog of prepared soundtracks.
- `/soundtracks/[slug]` = detail/player page. It can play the format continuously, export an exact length, export a number of pattern repetitions, clone to the editor, or save a private clone.
- `/studio` = free create/edit page. Local play/export/share require no login. Saving to private library requires Phantom.
- `/library` = private wallet library of saved custom tracks.
- `/admin` = admin CRUD scaffold for prepared soundtrack rows.

The old `/templates` route is left as a compatibility alias that points users to `/soundtracks`.

## What's new in v0.3

- Renamed the public IA from templates to ready brainwave soundtracks.
- Main page now routes users toward creating their own track or browsing prepared soundtracks.
- Soundtrack detail page has a direct player, repeat-aware WAV export, and clone actions.
- Audio engine can loop the session pattern for live playback and offline exports.
- Studio save flow prompts Phantom automatically when a wallet session is required.
- Admin page can create/update/delete prepared soundtrack rows from ENTRAIN JSON.
- `ADMIN_TOKEN` added for the admin route scaffold.

## ENTRAIN session format

```ts
{
  format: 'entrain.session.v1',
  name: string,
  durationMin: number,
  notes?: string,
  export?: { fadeSec?: number, sampleRate?: 32000 | 44100 | 48000 },
  layers: [
    {
      id: string,
      type: 'binaural' | 'monaural' | 'iso-smooth' | 'iso-hard' | 'carrier' | 'noise' | 'sample',
      carrierHz?: number,
      wave?: 'sine' | 'triangle' | 'sawtooth',
      noiseColor?: 'white' | 'pink' | 'brown',
      pan?: number,
      panMotion?: { rateHz: number, depth: number },
      sampleName?: string,
      sampleLoop?: { mode: 'native' | 'crossfade', startSec?: number, endSec?: number, crossfadeSec?: number },
      keyframes: [{ tMin: number, beatHz?: number, gainPct: number }]
    }
  ]
}
```

Binaural layers intentionally ignore pan and pan motion. Panning them would bleed each ear's carrier into the other and break the interaural offset that creates the beat.

## Token gates

The client asks Phantom to sign a nonce. The server verifies the ed25519 signature, reads the configured SPL token balance, writes a short-lived HTTP-only session in SQLite, then serves gated soundtrack JSON through `/api/access?slug=...` only when `balance >= minTokens`.

Set `ALLOW_DEV_UNLOCK=1` in `.env` for local UI work without a token balance.

## Admin rows

Set `ADMIN_TOKEN` in `.env`, open `/admin`, paste the token, and manage rows. Each row has:

- slug, title, summary, description, category, tags
- `minTokens` gate, with tier derived from token amount
- published/draft flag
- raw ENTRAIN session JSON

For production, replace the token scaffold with a proper role check.

## Ambience files

Ambience files are decoded into runtime-only `AudioBuffer`s. JSON, saved sessions, and share URLs preserve filenames and loop settings only. After loading a shared/saved session, reload the local audio file before playback/export.
