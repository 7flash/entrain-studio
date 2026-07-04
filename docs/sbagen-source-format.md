# SBaGen source format and ENTRAIN runtime compilation

ENTRAIN uses an SBaGen-compatible source language as the human authoring/storage surface for prepared catalogue soundtracks wherever the pattern can be represented with classic SBaGen primitives.

Example:

```txt
h4: pink/50 100+4/50
h5: pink/50 100+2/50
h4 -> +00:06:00 h5
```

Meaning:

- `h4:` declares a named acoustic state.
- `pink/50` creates a pink-noise mask at 50% gain.
- `100+4/50` creates a binaural layer centered at 100 Hz with a 4 Hz beat at 50% gain.
- The player derives ear frequencies as:
  - left = carrier - beat / 2 = 98 Hz
  - right = carrier + beat / 2 = 102 Hz
- `h4 -> +00:06:00 h5` creates a six-minute linear interpolation between the two states.

## Database model

The database row stores:

- `scriptFormat`: the source language identifier, usually `sbagen.v1`.
- `scriptText`: the SBaGen-compatible source text.
- `session`: a compiled `entrain.session.v1` runtime cache used by the Web Audio player.

The script is the operator-facing source. The JSON session is an internal compiled graph/cache so the player and analyzer can work quickly and can represent ENTRAIN extensions that classic SBaGen cannot express.

## Interpolation correctness

The runtime does not synthesize swept sine waves with the incorrect formula `sin(2π * f(t) * t)`. That naive formula doubles the intended sweep slope because instantaneous frequency is the derivative of phase.

For oscillator layers, ENTRAIN schedules Web Audio `OscillatorNode.frequency` with `linearRampToValueAtTime`. The browser oscillator integrates instantaneous frequency internally, so the actual phase is:

```txt
theta(t) = 2π ∫ f(t) dt
```

For a linear glide `f(t) = f_start + beta * t`, the oscillator therefore produces:

```txt
theta(t) = 2π * (f_start * t + 0.5 * beta * t^2)
```

and the instantaneous frequency is exactly:

```txt
f_inst(t) = f_start + beta * t
```

So a 10 Hz → 2.5 Hz glide reaches 2.5 Hz at the scheduled endpoint, not halfway through the session.

## v0.34 source-first private shares

Studio private share links now prefer source text instead of compiled JSON:

```text
#src=v1.entrain.<raw|gzip>.<checksum>.<payload>
ENTRAIN-SOURCE:v1:entrain:<raw|gzip>:<checksum>:<payload>
```

The payload is an ENTRAIN script, not the runtime JSON cache. It is compiled in the browser after import. The script format keeps exact keyframes using a `points=` field, for example:

```text
iso-trap carrier=340 beat=6 gain=-8.4dB edge=8ms duty=0.45 points=[{"t":0,"g":38,"c":340,"b":6},{"t":12,"g":38,"c":340,"b":6}]
```

The player still compiles that source into `entrain.session.v1` before rendering because Web Audio needs a normalized graph. The compiled JSON is a cache/debug artifact, not the source-of-truth format.
