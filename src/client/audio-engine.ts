import {
  MIX,
  sampleTimeline,
  sortedKeyframes,
  type EntrainLayerV1,
  type EntrainSessionV1,
  type Keyframe,
} from "@/format/entrain-format";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const safeName = (s: string) =>
  String(s || "entrain")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 90);

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  stops: AudioScheduledSourceNode[];
  cleanups: Array<() => void>;
  startedAt: number;
  offsetSec: number;
  loopPattern: boolean;
  patternSec: number;
};

type BuildOptions = {
  live: boolean;
  durSec: number;
  fadeSec?: number;
  sampleRate?: number;
  loopPattern?: boolean;
  offsetSec?: number;
  delaySec?: number;
};

export function createAudioEngine(getSession: () => EntrainSessionV1) {
  let ctx: AudioContext | null = null;
  let graph: Graph | null = null;
  const samples = new Map<string, AudioBuffer>();

  function scheduleParam(
    param: AudioParam,
    pts: Keyframe[],
    key: "beatHz" | "gainPct",
    map: (x: number) => number,
    start: number,
    durSec: number,
    offsetSec = 0,
  ) {
    const offsetMin = Math.max(0, offsetSec) / 60;
    param.setValueAtTime(map(sampleTimeline(pts, key, offsetMin)), start);
    for (const p of sortedKeyframes(pts)) {
      const rel = p.tMin * 60 - offsetSec;
      if (rel <= 0.01 || rel > durSec) continue;
      param.linearRampToValueAtTime(map(Number(p[key] || 0)), start + rel);
    }
  }
  function audibleLayers(session: EntrainSessionV1) {
    const solo = session.layers.some((l) => l.solo);
    return session.layers.filter((l) => !l.mute && (!solo || l.solo));
  }
  function buildLayer(
    ctx: BaseAudioContext,
    l: EntrainLayerV1,
    start: number,
    durSec: number,
    count: number,
    offsetSec = 0,
    live = false,
    cleanups: Array<() => void> = [],
  ) {
    const layerGain = ctx.createGain();
    scheduleParam(
      layerGain.gain,
      l.keyframes,
      "gainPct",
      (v) => (v / 100) * (MIX.layerNorm / Math.sqrt(Math.max(1, count))),
      start,
      durSec,
      offsetSec,
    );
    let input: AudioNode = layerGain;
    const stops: AudioScheduledSourceNode[] = [];
    if (l.type !== "binaural" && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      const staticPan = clamp(l.pan || 0, -1, 1);
      p.pan.setValueAtTime(staticPan, start);
      const rate = clamp(l.panMotion?.rateHz || 0, 0, 0.25);
      if (rate > 0) {
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = rate;
        const pg = ctx.createGain();
        pg.gain.value =
          clamp(l.panMotion?.depth || 0, 0, 1) * (1 - Math.abs(staticPan));
        lfo.connect(pg);
        pg.connect(p.pan);
        lfo.start(start);
        lfo.stop(start + durSec + 0.1);
        stops.push(lfo);
      }
      p.connect(layerGain);
      input = p;
    }
    const stopAt = start + durSec + 0.1;
    if (l.type === "sample") {
      const b = samples.get(l.id);
      if (!b) return { node: layerGain, stops };
      scheduleSample(
        ctx,
        l,
        b,
        input,
        start,
        stopAt,
        stops,
        offsetSec,
        live,
        cleanups,
      );
      return { node: layerGain, stops };
    }
    if (l.type === "noise") {
      const src = noise(ctx, l.noiseColor || "pink", l.seed || 1001);
      src.connect(input);
      src.start(start);
      src.stop(stopAt);
      stops.push(src);
      return { node: layerGain, stops };
    }
    if (l.type === "procedural-ambience") {
      const src = proceduralAmbience(
        ctx,
        l.ambienceRecipe || "pink-rain",
        l.seed || 1337,
      );
      src.connect(input);
      src.start(start);
      src.stop(stopAt);
      stops.push(src);
      return { node: layerGain, stops };
    }

    if (l.type === "additive") {
      const stops2 = buildAdditiveLayer(ctx, l, input, start, stopAt);
      stops.push(...stops2);
      return { node: layerGain, stops };
    }
    if (l.type === "karplus") {
      const stops2 = buildKarplusLayer(
        ctx,
        l,
        input,
        start,
        stopAt,
        offsetSec,
        live,
        cleanups,
      );
      stops.push(...stops2);
      return { node: layerGain, stops };
    }
    if (l.type === "carrier") {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = l.carrierHz || 220;
      o.connect(input);
      o.start(start);
      o.stop(stopAt);
      stops.push(o);
      return { node: layerGain, stops };
    }
    const carrier = clamp(l.carrierHz || 220, 20, 2000);
    if (l.type === "binaural" || l.type === "monaural") {
      const a = ctx.createOscillator(),
        b = ctx.createOscillator();
      a.type = b.type = l.wave || "sine";
      scheduleParam(
        a.frequency,
        l.keyframes,
        "beatHz",
        (hz) => Math.max(20, carrier - hz / 2),
        start,
        durSec,
        offsetSec,
      );
      scheduleParam(
        b.frequency,
        l.keyframes,
        "beatHz",
        (hz) => Math.max(20, carrier + hz / 2),
        start,
        durSec,
        offsetSec,
      );
      const ga = ctx.createGain(),
        gb = ctx.createGain();
      ga.gain.value = gb.gain.value = 0.5;
      if (l.type === "binaural") {
        const m = ctx.createChannelMerger(2);
        a.connect(ga);
        ga.connect(m, 0, 0);
        b.connect(gb);
        gb.connect(m, 0, 1);
        m.connect(layerGain);
      } else {
        a.connect(ga);
        b.connect(gb);
        ga.connect(input);
        gb.connect(input);
      }
      a.start(start);
      b.start(start);
      a.stop(stopAt);
      b.stop(stopAt);
      stops.push(a, b);
      return { node: layerGain, stops };
    }
    const car = ctx.createOscillator();
    car.type = l.wave || "sine";
    car.frequency.value = carrier;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = l.type === "iso-hard" ? "square" : "sine";
    scheduleParam(
      lfo.frequency,
      l.keyframes,
      "beatHz",
      (hz) => Math.max(0.1, hz),
      start,
      durSec,
      offsetSec,
    );
    const mg = ctx.createGain();
    mg.gain.value = 0.5;
    const off = ctx.createConstantSource();
    off.offset.value = 0.5;
    lfo.connect(mg);
    mg.connect(amp.gain);
    off.connect(amp.gain);
    car.connect(amp);
    amp.connect(input);
    car.start(start);
    lfo.start(start);
    off.start(start);
    car.stop(stopAt);
    lfo.stop(stopAt);
    off.stop(stopAt);
    stops.push(car, lfo, off);
    return { node: layerGain, stops };
  }

  function scheduleSample(
    ctx: BaseAudioContext,
    l: EntrainLayerV1,
    buffer: AudioBuffer,
    input: AudioNode,
    start: number,
    stopAt: number,
    stops: AudioScheduledSourceNode[],
    offsetSec = 0,
    live = false,
    cleanups: Array<() => void> = [],
  ) {
    const loop = l.sampleLoop || { mode: "native" as const };
    const loopStart = clamp(
      loop.startSec || 0,
      0,
      Math.max(0, buffer.duration - 0.05),
    );
    const loopEnd = clamp(
      loop.endSec && loop.endSec > loopStart ? loop.endSec : buffer.duration,
      loopStart + 0.05,
      buffer.duration,
    );
    const xfade = clamp(
      loop.crossfadeSec || 0,
      0,
      Math.max(0, (loopEnd - loopStart) / 2),
    );
    if (loop.mode !== "crossfade" || xfade < 0.02) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
      const segment = Math.max(0.05, loopEnd - loopStart);
      const phase = loopStart + (Math.max(0, offsetSec) % segment);
      src.connect(input);
      src.start(start, phase);
      src.stop(stopAt);
      stops.push(src);
      return;
    }
    const segment = loopEnd - loopStart;
    const hop = Math.max(0.1, segment - xfade);
    const initialPhase = Math.max(0, offsetSec) % Math.max(0.1, hop);
    let nextT = start - initialPhase;
    let first = true;

    const scheduleOne = (t: number) => {
      const visibleStart = Math.max(t, start);
      const dur = Math.min(
        segment - Math.max(0, start - t),
        stopAt - visibleStart,
      );
      if (dur <= 0.02) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      const fade = Math.min(xfade, dur / 2);
      const schedT = Math.max(t, start);
      g.gain.setValueAtTime(first ? 1 : 0.0001, schedT);
      if (!first) g.gain.linearRampToValueAtTime(1, schedT + fade);
      g.gain.setValueAtTime(1, Math.max(schedT, schedT + dur - fade));
      g.gain.linearRampToValueAtTime(0.0001, schedT + dur);
      src.connect(g);
      g.connect(input);
      src.start(schedT, loopStart + Math.max(0, start - t), dur + 0.01);
      src.stop(Math.min(stopAt, schedT + dur + 0.05));
      stops.push(src);
      first = false;
    };

    const scheduleUntil = (horizonAbs: number, maxNodes = 50000) => {
      let guard = 0;
      while (nextT < Math.min(stopAt, horizonAbs) && guard++ < maxNodes) {
        scheduleOne(nextT);
        nextT += hop;
      }
    };

    if (!live) {
      scheduleUntil(stopAt);
      return;
    }

    const LOOKAHEAD_SEC = 45;
    scheduleUntil(Math.min(stopAt, start + LOOKAHEAD_SEC), 2000);
    const timer = setInterval(() => {
      if (!ctx || ctx.currentTime + LOOKAHEAD_SEC >= stopAt) {
        scheduleUntil(stopAt, 2000);
        clearInterval(timer);
        return;
      }
      scheduleUntil(ctx.currentTime + LOOKAHEAD_SEC, 2000);
    }, 10_000);
    cleanups.push(() => clearInterval(timer));
  }

  function build(ctx: BaseAudioContext, dest: AudioNode, opts: BuildOptions) {
    const delay = opts.live ? Math.max(0.04, opts.delaySec || 0.04) : 0;
    const session = getSession(),
      start = ctx.currentTime + delay,
      dur = opts.durSec || session.durationMin * 60;
    const master = ctx.createGain();
    const peak = MIX.masterPeak;
    const fadeIn = Math.max(0.02, Math.min(opts.fadeSec ?? 0.8, dur / 2));
    master.gain.setValueAtTime(0.0001, start);
    master.gain.linearRampToValueAtTime(peak, start + fadeIn);
    if (!opts.live && (opts.fadeSec || 0) > 0) {
      const outStart = Math.max(start, start + dur - (opts.fadeSec || 0));
      master.gain.setValueAtTime(peak, outStart);
      master.gain.linearRampToValueAtTime(0.0001, start + dur);
    }
    const stops: AudioScheduledSourceNode[] = [];
    const cleanups: Array<() => void> = [];
    const layers = audibleLayers(session);
    const patternSec = Math.max(1, session.durationMin * 60);
    const loopMode = session.loop?.mode || "hold-last";
    const shouldRepeat = opts.loopPattern && loopMode !== "hold-last";
    const offset = Math.max(0, opts.offsetSec || 0);
    if (shouldRepeat) {
      let remaining = dur;
      let cycleStart = start;
      let phase = offset % patternSec;
      let guard = 0;
      while (remaining > 0.02 && guard++ < 10000) {
        const cycleDur = Math.min(patternSec - phase, remaining);
        for (const l of layers) {
          const out = buildLayer(
            ctx,
            l,
            cycleStart,
            cycleDur,
            layers.length || 1,
            phase,
            !!opts.live,
            cleanups,
          );
          out.node.connect(master);
          stops.push(...out.stops);
        }
        remaining -= cycleDur;
        cycleStart += cycleDur;
        phase = 0;
      }
    } else {
      const phase = Math.min(offset, patternSec);
      for (const l of layers) {
        const out = buildLayer(
          ctx,
          l,
          start,
          dur,
          layers.length || 1,
          phase,
          !!opts.live,
          cleanups,
        );
        out.node.connect(master);
        stops.push(...out.stops);
      }
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = MIX.limiterThresholdDb;
    comp.knee.value = 0;
    comp.ratio.value = MIX.limiterRatio;
    comp.attack.value = MIX.limiterAttackSec;
    comp.release.value = MIX.limiterReleaseSec;
    master.connect(comp);
    if (opts.live) {
      const analyser = (ctx as AudioContext).createAnalyser();
      analyser.fftSize = 2048;
      comp.connect(analyser);
      analyser.connect(dest);
      return {
        master,
        analyser,
        stops,
        cleanups,
        startedAt: start,
        offsetSec: offset,
        loopPattern: !!opts.loopPattern,
        patternSec,
      };
    }
    comp.connect(dest);
    return {
      master,
      analyser: null,
      stops,
      cleanups,
      startedAt: start,
      offsetSec: offset,
      loopPattern: !!opts.loopPattern,
      patternSec,
    };
  }

  return {
    get running() {
      return !!graph;
    },
    samples,
    async start(opts?: {
      loopPattern?: boolean;
      offsetSec?: number;
      delaySec?: number;
    }) {
      ctx = ctx || new AudioContext();
      await ctx.resume();
      const session = getSession();
      const mode = session.loop?.mode || "hold-last";
      const liveSec =
        opts?.loopPattern || mode === "hold-last"
          ? Math.max(session.durationMin * 60, 8 * 60 * 60)
          : Math.max(
              1,
              session.durationMin * 60 - Math.max(0, opts?.offsetSec || 0),
            );
      const built = build(ctx, ctx.destination, {
        live: true,
        durSec: liveSec,
        fadeSec: session.export?.fadeSec || 0,
        loopPattern: !!opts?.loopPattern,
        offsetSec: opts?.offsetSec || 0,
        delaySec: opts?.delaySec || 0,
      });
      graph = {
        ctx,
        master: built.master,
        analyser: built.analyser!,
        stops: built.stops,
        cleanups: built.cleanups,
        startedAt: built.startedAt,
        offsetSec: built.offsetSec,
        loopPattern: built.loopPattern,
        patternSec: built.patternSec,
      };
    },
    stop() {
      if (!graph) return;
      const current = graph;
      const t = current.ctx.currentTime;
      current.master.gain.setTargetAtTime(0.0001, t, 0.04);
      for (const fn of current.cleanups) {
        try {
          fn();
        } catch {}
      }
      setTimeout(
        () =>
          current.stops.forEach((s) => {
            try {
              s.stop();
            } catch {}
          }),
        180,
      );
      graph = null;
    },
    rebuild() {
      const was = !!graph;
      const offset = this.positionSec();
      this.stop();
      if (was)
        setTimeout(
          () => this.start({ loopPattern: true, offsetSec: offset }),
          120,
        );
    },
    positionSec() {
      if (!graph) return 0;
      const raw =
        graph.offsetSec + Math.max(0, graph.ctx.currentTime - graph.startedAt);
      return graph.loopPattern ? raw : Math.min(raw, graph.patternSec);
    },
    async loadSample(layerId: string, file: File) {
      ctx = ctx || new AudioContext();
      samples.set(layerId, await ctx.decodeAudioData(await file.arrayBuffer()));
    },
    hasSample(layerId: string) {
      return samples.has(layerId);
    },
    async renderWav(
      seconds?: number,
      sampleRate?: number,
      fadeSec?: number,
      opts?: { loopPattern?: boolean; repetitions?: number },
    ) {
      const session = getSession();
      const requested = opts?.repetitions
        ? session.durationMin * 60 * opts.repetitions
        : seconds || session.durationMin * 60;
      const durSec = Math.max(1, Math.min(requested, 60 * 60));
      const sr = sampleRate || session.export?.sampleRate || 44100;
      const off = new OfflineAudioContext(2, Math.floor(sr * durSec), sr);
      build(off, off.destination, {
        live: false,
        durSec,
        fadeSec: fadeSec ?? session.export?.fadeSec ?? 4,
        loopPattern: !!(opts?.loopPattern || opts?.repetitions),
      });
      const buf = await off.startRendering();
      const blob = bufferToWav(buf);
      const suffix = opts?.repetitions
        ? `${opts.repetitions}x`
        : `${Math.round(durSec / 60)}min`;
      return { blob, filename: `${safeName(session.name)}_${suffix}.wav` };
    },
    drawScope(canvas: HTMLCanvasElement) {
      if (!graph) return;
      const r = canvas.getBoundingClientRect(),
        d = devicePixelRatio || 1;
      canvas.width = r.width * d;
      canvas.height = r.height * d;
      const x = canvas.getContext("2d")!;
      x.setTransform(d, 0, 0, d, 0, 0);
      const arr = new Uint8Array(graph.analyser.fftSize);
      graph.analyser.getByteTimeDomainData(arr);
      x.clearRect(0, 0, r.width, r.height);
      x.strokeStyle = "#54dccf";
      x.beginPath();
      arr.forEach((v, i) => {
        const px = (i / (arr.length - 1)) * r.width,
          py = r.height / 2 + ((v - 128) / 128) * r.height * 0.42;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      });
      x.stroke();
    },
  };
}

function buildAdditiveLayer(
  ctx: BaseAudioContext,
  l: EntrainLayerV1,
  input: AudioNode,
  start: number,
  stopAt: number,
) {
  const stops: AudioScheduledSourceNode[] = [];
  const base = clamp(l.carrierHz || 136.1, 20, 2000);
  const partials = (
    l.partials && l.partials.length ? l.partials : bowlPartials()
  ).slice(0, 16);
  const totalGain = Math.max(
    1,
    partials.reduce((sum, p) => sum + Math.max(0, p.gain || 0), 0),
  );
  const env = l.envelope || {
    attackMs: 800,
    decayMs: 2000,
    sustain: 0.85,
    releaseMs: 3000,
  };
  for (let i = 0; i < partials.length; i++) {
    const part = partials[i];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = l.wave || "sine";
    const cents = Math.pow(2, (part.detuneCents || 0) / 1200);
    osc.frequency.setValueAtTime(
      base * Math.max(0.05, part.ratio || 1) * cents,
      start,
    );
    const target = Math.max(0, part.gain || 0) / totalGain;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(
      target,
      start + Math.max(0.001, (env.attackMs || 0) / 1000),
    );
    if (env.decayMs > 0 && env.sustain < 1) {
      g.gain.linearRampToValueAtTime(
        target * clamp(env.sustain, 0, 1),
        start + Math.max(0.001, (env.attackMs + env.decayMs) / 1000),
      );
    }
    if (part.decaySec && part.decaySec > 0) {
      g.gain.setTargetAtTime(0.0001, start, Math.max(0.02, part.decaySec / 5));
    }
    const rel = Math.max(0.001, (env.releaseMs || 0) / 1000);
    if (stopAt - start > rel + 0.05) {
      g.gain.setValueAtTime(
        Math.max(0.0001, target * clamp(env.sustain ?? 1, 0, 1)),
        Math.max(start, stopAt - rel),
      );
      g.gain.linearRampToValueAtTime(0.0001, stopAt);
    }
    osc.connect(g);
    g.connect(input);
    osc.start(start);
    osc.stop(stopAt + 0.02);
    stops.push(osc);
  }
  return stops;
}

function buildKarplusLayer(
  ctx: BaseAudioContext,
  l: EntrainLayerV1,
  input: AudioNode,
  start: number,
  stopAt: number,
  offsetSec = 0,
  live = false,
  cleanups: Array<() => void> = [],
) {
  const stops: AudioScheduledSourceNode[] = [];
  const cfg = l.karplus || {
    rateHz: 0.08,
    decay: 0.996,
    brightness: 0.5,
    durationSec: 6,
  };
  const freq = clamp(l.carrierHz || 220, 40, 1600);
  const rate = clamp(cfg.rateHz || 0.08, 0.005, 2);
  const interval = 1 / rate;
  const dur = clamp(cfg.durationSec || 6, 1, 30);
  let t = start - (Math.max(0, offsetSec) % interval);
  let i = 0;
  const scheduleOne = (at: number, index: number) => {
    if (at + dur <= start || at >= stopAt) return;
    const buf = karplusBuffer(
      ctx,
      freq,
      (l.seed || 4242) + index * 101,
      cfg.decay || 0.996,
      cfg.brightness ?? 0.5,
      dur,
    );
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(input);
    src.start(Math.max(start, at), Math.max(0, start - at));
    src.stop(Math.min(stopAt, at + dur + 0.05));
    stops.push(src);
  };
  const scheduleUntil = (horizonAbs: number, maxNodes = 10000) => {
    let guard = 0;
    while (t < Math.min(stopAt, horizonAbs) && guard++ < maxNodes) {
      scheduleOne(t, i++);
      t += interval;
    }
  };
  if (!live) {
    scheduleUntil(stopAt);
    return stops;
  }
  const LOOKAHEAD_SEC = 45;
  scheduleUntil(Math.min(stopAt, start + LOOKAHEAD_SEC), 2000);
  const timer = setInterval(() => {
    const current = "currentTime" in ctx ? ctx.currentTime : 0;
    if (current + LOOKAHEAD_SEC >= stopAt) {
      scheduleUntil(stopAt, 2000);
      clearInterval(timer);
      return;
    }
    scheduleUntil(current + LOOKAHEAD_SEC, 2000);
  }, 10_000);
  cleanups.push(() => clearInterval(timer));
  return stops;
}

function karplusBuffer(
  ctx: BaseAudioContext,
  freq: number,
  seed: number,
  decay = 0.996,
  brightness = 0.5,
  lenSec = 6,
) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * lenSec));
  const n = Math.max(2, Math.round(ctx.sampleRate / Math.max(40, freq)));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = lcg(seed);
  const ring = new Float32Array(n);
  const bright = clamp(brightness, 0, 1);
  for (let i = 0; i < n; i++)
    ring[i] = (rnd() * 2 - 1) * (0.25 + 0.75 * bright);
  let p = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[p];
    const nxt = ring[(p + 1) % n];
    d[i] = cur * 0.72;
    const lowpassed = 0.5 * (cur + nxt);
    const sharper = lowpassed * (1 - bright * 0.35) + cur * (bright * 0.35);
    ring[p] = clamp(decay, 0.9, 0.9999) * sharper;
    p = (p + 1) % n;
  }
  return buf;
}

function bowlPartials(): Array<{
  ratio: number;
  gain: number;
  decaySec?: number;
  detuneCents?: number;
}> {
  return [
    { ratio: 1, gain: 1, detuneCents: 0 },
    { ratio: 1.5, gain: 0.5, detuneCents: 2 },
    { ratio: 2.001, gain: 0.32, detuneCents: -3 },
  ];
}

function snapToLoopHz(freq: number, lenSec: number) {
  const grid = 1 / Math.max(0.001, lenSec);
  return Math.max(grid, Math.round(freq / grid) * grid);
}

function additiveLoopBuffer(
  ctx: BaseAudioContext,
  baseHz: number,
  partials: Array<{ ratio: number; gain: number; detuneCents?: number }>,
  seed: number,
  lenSec = 16,
  opts: { rain?: boolean } = {},
) {
  const len = Math.floor(ctx.sampleRate * lenSec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const totalGain = Math.max(
    1,
    partials.reduce((s, p) => s + Math.max(0, p.gain || 0), 0),
  );
  const slowHz = snapToLoopHz(0.07, lenSec);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const phaseOffset = ch ? Math.PI * 0.37 : 0;
    const rnd = lcg((seed || 1) + ch * 1013904223);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const slow = Math.sin(2 * Math.PI * slowHz * t + phaseOffset) * 0.5 + 0.5;
      let v = 0;
      for (const part of partials) {
        const cents = Math.pow(2, (part.detuneCents || 0) / 1200);
        const f = snapToLoopHz(
          baseHz * Math.max(0.05, part.ratio || 1) * cents,
          lenSec,
        );
        v +=
          Math.sin(2 * Math.PI * f * t + phaseOffset) * (part.gain / totalGain);
      }
      let mask = 0;
      if (opts.rain) {
        const w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        mask = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
        const drops = rnd() > 0.997 ? (rnd() * 2 - 1) * 0.25 : 0;
        mask = mask * 0.5 + drops;
      }
      d[i] = v * (0.72 + 0.28 * slow) * 0.16 + mask * 0.35;
    }
    // Equal-power seam polish: the snapped harmonic grid should already be phase-continuous;
    // this tiny wrap crossfade protects against numerical/noise discontinuity.
    const fade = Math.min(
      Math.floor(ctx.sampleRate * 0.04),
      Math.floor(len / 8),
    );
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      const head = d[i],
        tail = d[len - fade + i];
      const mixed = tail * (1 - a) + head * a;
      d[i] = mixed;
      d[len - fade + i] = mixed;
    }
  }
  return buf;
}

function noise(ctx: BaseAudioContext, color: string, seed = 1001) {
  const len = Math.floor(ctx.sampleRate * 10),
    buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = lcg(seed + ch * 1013904223);
    const d = buf.getChannelData(ch);
    let last = 0,
      b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd() * 2 - 1;
      if (color === "white") d[i] = w;
      else if (color === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}
function bufferToWav(buf: AudioBuffer) {
  const n = buf.length,
    ch = Math.min(2, buf.numberOfChannels),
    sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n * ch * 2),
    dv = new DataView(ab);
  const wr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  wr(0, "RIFF");
  dv.setUint32(4, 36 + n * ch * 2, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  wr(36, "data");
  dv.setUint32(40, n * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = clamp(data[c][i], -1, 1);
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([ab], { type: "audio/wav" });
}
function finishBufferSource(ctx: BaseAudioContext, buf: AudioBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}
function proceduralAmbience(
  ctx: BaseAudioContext,
  recipe: string,
  seed: number,
) {
  if (recipe === "bowl-drone")
    return finishBufferSource(
      ctx,
      additiveLoopBuffer(ctx, 136.1, bowlPartials(), seed, 16),
    );
  if (recipe === "heavy-rain-bowls")
    return finishBufferSource(
      ctx,
      additiveLoopBuffer(ctx, 136.1, bowlPartials(), seed, 16, { rain: true }),
    );
  const lenSec = 10;
  const len = Math.floor(ctx.sampleRate * lenSec),
    buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = lcg(seed + ch * 1013904223);
    let last = 0,
      b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    const phaseOffset = ch ? Math.PI * 0.37 : 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const w = rnd() * 2 - 1;
      if (recipe === "brown-room") {
        last = (last + 0.018 * w) / 1.018;
        d[i] =
          last * 2.8 +
          Math.sin(2 * Math.PI * snapToLoopHz(55, lenSec) * t + phaseOffset) *
            0.02;
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
        const drops =
          recipe === "rain" && rnd() > 0.996 ? (rnd() * 2 - 1) * 0.45 : 0;
        d[i] = pink * 0.8 + drops;
      }
    }
    // Generic short loop polish for stochastic beds.
    const fade = Math.min(
      Math.floor(ctx.sampleRate * 0.08),
      Math.floor(len / 8),
    );
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      const head = d[i],
        tail = d[len - fade + i];
      const mixed = tail * (1 - a) + head * a;
      d[i] = mixed;
      d[len - fade + i] = mixed;
    }
  }
  return finishBufferSource(ctx, buf);
}
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
