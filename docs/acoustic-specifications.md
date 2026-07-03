# ENTRAIN Acoustic Specifications

This document records the signal assumptions used by the built-in report-derived soundtracks and by the Studio analyzer.

## Binaural layer math

For a carrier `f_c` and target beat `f_b`, ENTRAIN generates separated stereo tones:

```text
left  = f_c - f_b / 2
right = f_c + f_b / 2
```

Binaural layers are never panned. Panning would bleed the interaural offset and turn the signal into a different stimulus. Monaural layers intentionally sum both tones into the same channel path, creating a real acoustic beat.

## Linear glides

A linear glide is stored as keyframes. The Web Audio `OscillatorNode.frequency` parameter integrates instantaneous frequency internally, so a linear frequency ramp produces the correct phase:

```text
phase(t) = 2π · (f_start · t + 0.5 · beta · t²)
```

Do not hand-roll swept tones as `sin(2π · f(t) · t)`. That doubles the sweep rate. ENTRAIN's live and offline engines avoid that bug by scheduling `frequency.linearRampToValueAtTime(...)`.

## Deep Descent 60 reference

Carrier: `140 Hz`.

Phase 1, 0–30 minutes:

```text
f_b(t) = 10.0 - ((10.0 - 2.5) / 1800) · t
       = 10.0 - 0.004167 · t
```

Phase 2, 30–60 minutes:

```text
f_b(t) = 2.5 - ((2.5 - 1.5) / 1800) · (t - 1800)
       = 2.5 - 0.000556 · (t - 1800)
```

The built-in row stores this as 0 min / 30 min / 60 min keyframes.

## Isochronic layers

Isochronic amplitude envelopes use full-depth gating:

```text
smooth = (1 + sine_lfo) / 2
hard   = (1 + square_lfo) / 2
```

The smooth form is a raised-cosine pulse train that reaches silence while avoiding hard edges. The hard form is a full-depth gate and should be used carefully at low volume.

## Mix safety

The analyzer and audio engine share the same mix constants:

```text
layerNorm = 0.55 / sqrt(audibleLayerCount)
masterPeak = 0.75
limiter threshold = -1.5 dBFS
```

The compressor is configured as a dormant safety limiter, not as a tone-shaping compressor. Normal analyzer-passed sessions should not drive it.

## SBaGen mapping

A compact SBaGen line:

```text
h4: pink/50 100+4/50
```

maps to a state named `h4`, pink noise at 50%, and a 100 Hz carrier with a 4 Hz binaural beat at 50% gain. The generated left/right tones are 98 Hz and 102 Hz.

A transition line:

```text
h4 -> +00:06:00 h5
```

maps to a six-minute linear transition between the two state definitions.
