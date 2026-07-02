import type { EntrainLayerV1, EntrainSessionV1, Keyframe } from '@/format/entrain-format';

const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const safeName = (s: string) => String(s || 'entrain').replace(/[^\w.-]+/g, '_').slice(0, 90);

type Graph = { ctx: AudioContext; master: GainNode; analyser: AnalyserNode; stops: AudioScheduledSourceNode[]; startedAt: number };

type BuildOptions = { live: boolean; durSec: number; fadeSec?: number; sampleRate?: number; loopPattern?: boolean };

export function createAudioEngine(getSession: () => EntrainSessionV1) {
  let ctx: AudioContext | null = null;
  let graph: Graph | null = null;
  const samples = new Map<string, AudioBuffer>();

  function sorted(pts: Keyframe[]) { return [...(pts || [])].sort((a,b)=>a.tMin-b.tMin); }
  function tlVal(pts: Keyframe[], key: 'beatHz'|'gainPct', tMin: number) {
    const p = sorted(pts);
    if (!p.length) return 0;
    if (tMin <= p[0].tMin) return Number(p[0][key] || 0);
    for (let i=1;i<p.length;i++) if (tMin <= p[i].tMin) {
      const a=p[i-1], b=p[i], f=(tMin-a.tMin)/Math.max(1e-9,b.tMin-a.tMin);
      return Number(a[key] || 0) + (Number(b[key] || 0)-Number(a[key] || 0))*f;
    }
    return Number(p[p.length-1][key] || 0);
  }
  function scheduleParam(param: AudioParam, pts: Keyframe[], key: 'beatHz'|'gainPct', map:(x:number)=>number, start:number, durSec:number) {
    param.setValueAtTime(map(tlVal(pts,key,0)), start);
    for (const p of sorted(pts)) {
      const rel = p.tMin * 60;
      if (rel <= 0.01 || rel > durSec) continue;
      param.linearRampToValueAtTime(map(Number(p[key] || 0)), start + rel);
    }
  }
  function audibleLayers(session: EntrainSessionV1) {
    const solo = session.layers.some((l) => l.solo);
    return session.layers.filter((l) => !l.mute && (!solo || l.solo));
  }
  function buildLayer(ctx: BaseAudioContext, l: EntrainLayerV1, start:number, durSec:number, count:number) {
    const layerGain = ctx.createGain();
    scheduleParam(layerGain.gain, l.keyframes, 'gainPct', v => (v/100) * (0.55/Math.sqrt(Math.max(1,count))), start, durSec);
    let input: AudioNode = layerGain;
    const stops: AudioScheduledSourceNode[] = [];
    if (l.type !== 'binaural' && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      const staticPan = clamp(l.pan || 0, -1, 1);
      p.pan.setValueAtTime(staticPan, start);
      const rate = clamp(l.panMotion?.rateHz || 0, 0, 0.25);
      if (rate > 0) {
        const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value=rate;
        const pg = ctx.createGain(); pg.gain.value=clamp(l.panMotion?.depth || 0,0,1) * (1 - Math.abs(staticPan));
        lfo.connect(pg); pg.connect(p.pan); lfo.start(start); lfo.stop(start+durSec+.1); stops.push(lfo);
      }
      p.connect(layerGain); input = p;
    }
    const stopAt = start + durSec + .1;
    if (l.type === 'sample') {
      const b = samples.get(l.id);
      if (!b) return { node: layerGain, stops };
      scheduleSample(ctx, l, b, input, start, stopAt, stops);
      return { node: layerGain, stops };
    }
    if (l.type === 'noise') {
      const src = noise(ctx, l.noiseColor || 'pink'); src.connect(input); src.start(start); src.stop(stopAt); stops.push(src); return { node: layerGain, stops };
    }
    if (l.type === 'carrier') {
      const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=l.carrierHz || 220; o.connect(input); o.start(start); o.stop(stopAt); stops.push(o); return { node: layerGain, stops };
    }
    const carrier = clamp(l.carrierHz || 220, 20, 2000);
    if (l.type === 'binaural' || l.type === 'monaural') {
      const a=ctx.createOscillator(), b=ctx.createOscillator(); a.type=b.type=l.wave||'sine';
      scheduleParam(a.frequency,l.keyframes,'beatHz', hz=>Math.max(20,carrier-hz/2), start, durSec);
      scheduleParam(b.frequency,l.keyframes,'beatHz', hz=>Math.max(20,carrier+hz/2), start, durSec);
      const ga=ctx.createGain(), gb=ctx.createGain(); ga.gain.value=gb.gain.value=.5;
      if (l.type === 'binaural') { const m=ctx.createChannelMerger(2); a.connect(ga); ga.connect(m,0,0); b.connect(gb); gb.connect(m,0,1); m.connect(layerGain); }
      else { a.connect(ga); b.connect(gb); ga.connect(input); gb.connect(input); }
      a.start(start); b.start(start); a.stop(stopAt); b.stop(stopAt); stops.push(a,b); return { node: layerGain, stops };
    }
    const car=ctx.createOscillator(); car.type=l.wave||'sine'; car.frequency.value=carrier;
    const amp=ctx.createGain(); amp.gain.value=0;
    const lfo=ctx.createOscillator(); lfo.type = l.type==='iso-hard'?'square':'sine';
    scheduleParam(lfo.frequency,l.keyframes,'beatHz',hz=>Math.max(.1,hz), start, durSec);
    const mg=ctx.createGain(); mg.gain.value=l.type==='iso-hard'?.47:.4;
    const off=ctx.createConstantSource(); off.offset.value=l.type==='iso-hard'?.50:.56;
    lfo.connect(mg); mg.connect(amp.gain); off.connect(amp.gain); car.connect(amp); amp.connect(input);
    car.start(start); lfo.start(start); off.start(start); car.stop(stopAt); lfo.stop(stopAt); off.stop(stopAt); stops.push(car,lfo,off); return { node: layerGain, stops };
  }

  function scheduleSample(ctx: BaseAudioContext, l: EntrainLayerV1, buffer: AudioBuffer, input: AudioNode, start: number, stopAt: number, stops: AudioScheduledSourceNode[]) {
    const loop = l.sampleLoop || { mode: 'native' as const };
    const loopStart = clamp(loop.startSec || 0, 0, Math.max(0, buffer.duration - 0.05));
    const loopEnd = clamp(loop.endSec && loop.endSec > loopStart ? loop.endSec : buffer.duration, loopStart + 0.05, buffer.duration);
    const xfade = clamp(loop.crossfadeSec || 0, 0, Math.max(0, (loopEnd - loopStart) / 2));
    if (loop.mode !== 'crossfade' || xfade < 0.02) {
      const src = ctx.createBufferSource(); src.buffer=buffer; src.loop=true; src.loopStart=loopStart; src.loopEnd=loopEnd;
      src.connect(input); src.start(start, loopStart); src.stop(stopAt); stops.push(src); return;
    }
    const segment = loopEnd - loopStart;
    const hop = Math.max(0.1, segment - xfade);
    let t = start;
    let first = true;
    let guard = 0;
    while (t < stopAt && guard++ < 5000) {
      const dur = Math.min(segment, stopAt - t);
      if (dur <= 0.02) break;
      const src = ctx.createBufferSource(); src.buffer = buffer;
      const g = ctx.createGain();
      const fade = Math.min(xfade, dur / 2);
      g.gain.setValueAtTime(first ? 1 : 0.0001, t);
      if (!first) g.gain.linearRampToValueAtTime(1, t + fade);
      g.gain.setValueAtTime(1, Math.max(t, t + dur - fade));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(g); g.connect(input);
      src.start(t, loopStart, dur + 0.01);
      stops.push(src);
      first = false;
      t += hop;
    }
  }

  function build(ctx: BaseAudioContext, dest: AudioNode, opts: BuildOptions) {
    const session=getSession(), start=ctx.currentTime + (opts.live ? .04 : 0), dur=opts.durSec || session.durationMin*60;
    const master=ctx.createGain();
    const peak = .75;
    const fadeIn = Math.max(0.02, Math.min(opts.fadeSec ?? .8, dur/2));
    master.gain.setValueAtTime(0.0001,start);
    master.gain.linearRampToValueAtTime(peak,start+fadeIn);
    if (!opts.live && (opts.fadeSec || 0) > 0) {
      const outStart = Math.max(start, start + dur - (opts.fadeSec || 0));
      master.gain.setValueAtTime(peak, outStart);
      master.gain.linearRampToValueAtTime(0.0001, start + dur);
    }
    const stops: AudioScheduledSourceNode[]=[];
    const layers=audibleLayers(session);
    const patternSec = Math.max(1, session.durationMin * 60);
    const cycles = opts.loopPattern ? Math.max(1, Math.ceil(dur / patternSec)) : 1;
    for (let i = 0; i < cycles; i++) {
      const cycleStart = start + (opts.loopPattern ? i * patternSec : 0);
      const cycleDur = opts.loopPattern ? Math.min(patternSec, dur - i * patternSec) : dur;
      if (cycleDur <= 0.02) continue;
      for (const l of layers) {
        const out=buildLayer(ctx,l,cycleStart,cycleDur,layers.length || 1);
        out.node.connect(master); stops.push(...out.stops);
      }
    }
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-16; comp.knee.value=18; comp.ratio.value=8; comp.attack.value=.008; comp.release.value=.18; master.connect(comp);
    if (opts.live) {
      const analyser=(ctx as AudioContext).createAnalyser(); analyser.fftSize=2048; comp.connect(analyser); analyser.connect(dest); return { master, analyser, stops, startedAt:start };
    }
    comp.connect(dest); return { master, analyser:null, stops, startedAt:start };
  }

  return {
    get running(){ return !!graph; },
    samples,
    async start(opts?: { loopPattern?: boolean }){ ctx = ctx || new AudioContext(); await ctx.resume(); const session=getSession(); const liveSec = opts?.loopPattern ? Math.max(session.durationMin*60, 8*60*60) : session.durationMin*60; const built = build(ctx,ctx.destination,{ live:true, durSec:liveSec, fadeSec:session.export?.fadeSec || 0, loopPattern: !!opts?.loopPattern }); graph={ ctx, master:built.master, analyser:built.analyser!, stops:built.stops, startedAt:built.startedAt }; },
    stop(){ if(!graph) return; const current=graph; const t=current.ctx.currentTime; current.master.gain.setTargetAtTime(0.0001,t,.04); setTimeout(()=>current.stops.forEach(s=>{try{s.stop()}catch{}}),180); graph=null; },
    rebuild(){ const was=!!graph; this.stop(); if(was) setTimeout(()=>this.start(),120); },
    async loadSample(layerId:string, file:File){ ctx = ctx || new AudioContext(); samples.set(layerId, await ctx.decodeAudioData(await file.arrayBuffer())); },
    hasSample(layerId:string){ return samples.has(layerId); },
    async renderWav(seconds?: number, sampleRate?: number, fadeSec?: number, opts?: { loopPattern?: boolean; repetitions?: number }) {
      const session = getSession();
      const requested = opts?.repetitions ? session.durationMin * 60 * opts.repetitions : (seconds || session.durationMin * 60);
      const durSec = Math.max(1, Math.min(requested, 180 * 60));
      const sr = sampleRate || session.export?.sampleRate || 44100;
      const off = new OfflineAudioContext(2, Math.floor(sr * durSec), sr);
      build(off, off.destination, { live:false, durSec, fadeSec: fadeSec ?? session.export?.fadeSec ?? 4, loopPattern: !!(opts?.loopPattern || opts?.repetitions) });
      const buf = await off.startRendering();
      const blob = bufferToWav(buf);
      const suffix = opts?.repetitions ? `${opts.repetitions}x` : `${Math.round(durSec/60)}min`;
      return { blob, filename: `${safeName(session.name)}_${suffix}.wav` };
    },
    drawScope(canvas: HTMLCanvasElement){ if(!graph)return; const r=canvas.getBoundingClientRect(), d=devicePixelRatio||1; canvas.width=r.width*d; canvas.height=r.height*d; const x=canvas.getContext('2d')!; x.setTransform(d,0,0,d,0,0); const arr=new Uint8Array(graph.analyser.fftSize); graph.analyser.getByteTimeDomainData(arr); x.clearRect(0,0,r.width,r.height); x.strokeStyle='#54dccf'; x.beginPath(); arr.forEach((v,i)=>{ const px=i/(arr.length-1)*r.width, py=r.height/2+((v-128)/128)*r.height*.42; i?x.lineTo(px,py):x.moveTo(px,py); }); x.stroke(); }
  };
}
function noise(ctx: BaseAudioContext, color:string) {
  const len=Math.floor(ctx.sampleRate*2), buf=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch); let last=0,b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0; for(let i=0;i<len;i++){ const w=Math.random()*2-1; if(color==='white')d[i]=w; else if(color==='brown'){ last=(last+.02*w)/1.02; d[i]=last*3.5; } else { b0=.99886*b0+w*.0555179; b1=.99332*b1+w*.0750759; b2=.969*b2+w*.153852; b3=.8665*b3+w*.3104856; b4=.55*b4+w*.5329522; b5=-.7616*b5-w*.016898; d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11; b6=w*.115926; } } }
  const src=ctx.createBufferSource(); src.buffer=buf; src.loop=true; return src;
}
function bufferToWav(buf: AudioBuffer) {
  const n=buf.length,ch=Math.min(2,buf.numberOfChannels),sr=buf.sampleRate;
  const ab=new ArrayBuffer(44+n*ch*2),dv=new DataView(ab);
  const wr=(o:number,s:string)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  wr(0,'RIFF'); dv.setUint32(4,36+n*ch*2,true); wr(8,'WAVE'); wr(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,ch,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*ch*2,true); dv.setUint16(32,ch*2,true); dv.setUint16(34,16,true);
  wr(36,'data'); dv.setUint32(40,n*ch*2,true);
  const data=[]; for(let c=0;c<ch;c++)data.push(buf.getChannelData(c));
  let o=44; for(let i=0;i<n;i++)for(let c=0;c<ch;c++){ const v=clamp(data[c][i],-1,1); dv.setInt16(o,v<0?v*0x8000:v*0x7fff,true); o+=2; }
  return new Blob([ab],{type:'audio/wav'});
}
