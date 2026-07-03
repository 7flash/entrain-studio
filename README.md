# ENTRAIN TradJS Server v0.21

Local-first TradJS/Bun app for ENTRAIN Studio, prepared soundtracks, wallet-gated access, synced rooms, creator publishing, and private hash-based session sharing.

## v0.21 focus: algorithmic timbre beds

This pass keeps ENTRAIN centered on sustained attention soundtracks, not a musical note sequencer. It generalizes synthesis primitives that were already present as one-off code paths:

- `additive` layer type for deterministic partial-based drones.
  - Serializes as `carrierHz + partials[] + envelope`.
  - The existing `bowl-drone` procedural ambience is now generated through the same additive partial engine.
  - Studio includes additive presets: singing bowl, organ pad, and glass bell.
- `karplus` layer type for seeded Karplus-Strong plucked-string beds.
  - Serializes as `carrierHz + seed + karplus{rateHz,decay,brightness,durationSec}`.
  - Good for sparse harp/koto/kalimba-style texture without storing samples.
- Protocol analyzer now marks these as timbre beds instead of trying to apply binaural beat rules.
- Pattern text import/export supports `additive ...` and `karplus ...` lines.
- Private `#es` share URLs include the new layer parameters, so friends can reproduce the same algorithmic soundtrack without login or uploaded files.

## Run locally

```bash
bun install
cp .env.example .env
bun run sync:soundtracks
bun run dev
```

Studio remains no-login-first: edit, play, render WAV, import/export, and share private hash URLs without connecting Phantom.
