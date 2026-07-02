# ENTRAIN TradJS Server v0.2

Server-backed ENTRAIN Studio built around a first-class session/template format.

## Stack

- TradJS app routes and API routes.
- `tradjs/client` browser mounts; no React dependency.
- `sqlite-zod-orm` database with Zod-backed tables.
- `measure-fn` scopes around DB/auth/RPC operations.
- Phantom signed-message login and server-side SPL token balance gates.
- Local Web Audio rendering/export; no audio files are uploaded.

## Run

```bash
bun install
cp .env.example .env
bun run seed
bun run dev
```

Open `http://localhost:3000`.

## What's new in v0.2

- Template tiers: `free`, `holder`, `pro`, and `collector` mapped to `minTokens`.
- Category-grouped template library and richer template detail pages.
- Wallet library page for saved sessions.
- Server-side balance refresh endpoint that issues a fresh wallet session cookie.
- Studio share URLs via `#s=<compressed JSON>` using browser `CompressionStream` when available.
- Crossfaded ambience loop metadata and Web Audio scheduling for local sample layers.
- Studio WAV rendering hooked into the TradJS client shell.

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

The client asks Phantom to sign a nonce. The server verifies the ed25519 signature, reads the configured SPL token balance, writes a short-lived HTTP-only session in SQLite, then serves gated template JSON through `/api/access?slug=...` only when `balance >= minTokens`.

Set `ALLOW_DEV_UNLOCK=1` in `.env` for local UI work without a token balance.

## Ambience files

Ambience files are decoded into runtime-only `AudioBuffer`s. JSON, saved sessions, and share URLs preserve filenames and loop settings only. After loading a shared/saved session, reload the local audio file before playback/export.
