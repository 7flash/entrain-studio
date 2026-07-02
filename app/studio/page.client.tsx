import { render } from 'tradjs/client';
import type { EntrainLayerV1, EntrainSessionV1, LayerType } from '@/format/entrain-format';
import { defaultSession, sanitizeSession } from '@/format/entrain-format';
import { createAudioEngine } from '@/client/audio-engine';
import { decodeSessionHash, encodeSessionHash } from '@/client/session-codec';

let session: EntrainSessionV1 = defaultSession();
let engine = createAudioEngine(() => session);
let status = 'idle';
let notice = '';
let exportBusy = false;

const layerTypes: LayerType[] = ['binaural','monaural','iso-smooth','iso-hard','carrier','noise','sample'];
const isNoBeat = (l: EntrainLayerV1) => l.type === 'noise' || l.type === 'carrier' || l.type === 'sample';
const isNoCarrier = (l: EntrainLayerV1) => l.type === 'noise' || l.type === 'sample';
const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2,9);

function App() {
  return (
    <div>
      <div className="panel toolbar">
        <div>
          <strong>{session.name}</strong>
          <div className="small">{session.durationMin} min · {session.layers.length} layers · {status}</div>
          {notice ? <div className="small">{notice}</div> : null}
        </div>
        <div className="tagrow">
          <button className="btn primary" onClick={toggle}>{engine.running ? 'Stop' : 'Start'}</button>
          <button className="btn" onClick={addLayer}>+ Tone layer</button>
          <button className="btn" onClick={addNoise}>+ Noise</button>
          <button className="btn" onClick={addAmbience}>+ Ambience</button>
          <button className="btn" onClick={copyShareUrl}>Copy share URL</button>
          <button className="btn" onClick={saveServer}>Save to wallet</button>
          <button className="btn" disabled={exportBusy} onClick={exportWav}>{exportBusy ? 'Rendering…' : 'Render WAV'}</button>
          <button className="btn" onClick={exportJson}>Export JSON</button>
          <label className="btn">Import JSON<input type="file" accept=".json,application/json" style={{ display:'none' }} onChange={importJson} /></label>
        </div>
      </div>
      <div className="panel studio-grid">
        <aside>
          <div className="field"><label>Session name</label><input value={session.name} onInput={(e: any) => { session.name = e.currentTarget.value; repaint(); }} /></div>
          <div className="field"><label>Description / notes</label><textarea rows="4" value={session.notes || ''} onInput={(e:any)=>{ session.notes=e.currentTarget.value; repaint(); }} /></div>
          <div className="two">
            <div className="field"><label>Duration minutes</label><input type="number" min="1" max="180" value={String(session.durationMin)} onInput={(e: any) => { session.durationMin = Number(e.currentTarget.value || 1); normalizeTimelines(); repaint(true); }} /></div>
            <div className="field"><label>Export fade seconds</label><input type="number" min="0" max="30" step="1" value={String(session.export?.fadeSec ?? 4)} onInput={(e:any)=>{ session.export={...(session.export||{}), fadeSec:Number(e.currentTarget.value||0)}; repaint(); }} /></div>
          </div>
          <div className="field"><label>Sample rate</label><select value={String(session.export?.sampleRate || 44100)} onChange={(e:any)=>{ session.export={...(session.export||{}), sampleRate:Number(e.currentTarget.value)}; repaint(); }}><option value="32000">32 kHz</option><option value="44100">44.1 kHz</option><option value="48000">48 kHz</option></select></div>
          <div id="scope" className="scope"><canvas id="scope-canvas" /></div>
          <p className="small">Share URLs and JSON include filenames and loop settings for ambience files, but never embed local audio buffers. Reload the file after import/share.</p>
        </aside>
        <section>
          {session.layers.map((l, index) => <LayerCard l={l} index={index} key={l.id} />)}
        </section>
      </div>
    </div>
  );
}

function LayerCard({ l, index }: { l: EntrainLayerV1; index: number }) {
  const missingSample = l.type === 'sample' && !engine.hasSample(l.id);
  return <div className="layer">
    <div className="layer-head">
      <div><strong>{index + 1}. {l.type}</strong><div className="small">{describeLayer(l)}{missingSample ? ' · file not loaded' : ''}</div></div>
      <div className="tagrow"><button className="btn" onClick={() => duplicateLayer(l.id)}>dup</button><button className="btn" onClick={() => removeLayer(l.id)}>remove</button></div>
    </div>
    <div className="two">
      <div className="field"><label>Type</label><select value={l.type} onChange={(e:any)=>{ changeType(l, e.currentTarget.value as LayerType); repaint(true); }}>{layerTypes.map((x)=><option value={x} key={x}>{x}</option>)}</select></div>
      <div className="field"><label>Gain %</label><input type="range" min="0" max="100" value={String(l.keyframes[0]?.gainPct || 0)} onInput={(e:any)=>{ l.keyframes.forEach(k=>k.gainPct=Number(e.currentTarget.value)); repaint(true); }} /></div>
      {!isNoCarrier(l) ? <div className="field"><label>Carrier Hz</label><input type="number" min="20" max="2000" value={String(l.carrierHz || 220)} onInput={(e:any)=>{ l.carrierHz=Number(e.currentTarget.value); repaint(true); }} /></div> : null}
      {!isNoBeat(l) ? <div className="field"><label>Beat Hz</label><input type="number" step="0.1" min="0.1" max="45" value={String(l.keyframes[0]?.beatHz || 10)} onInput={(e:any)=>{ l.keyframes.forEach(k=>k.beatHz=Number(e.currentTarget.value)); repaint(true); }} /></div> : null}
      {!isNoBeat(l) ? <div className="field"><label>Beat end Hz</label><input type="number" step="0.1" min="0.1" max="45" value={String(l.keyframes[l.keyframes.length - 1]?.beatHz || 10)} onInput={(e:any)=>{ ensureTwoKeyframes(l); l.keyframes[l.keyframes.length-1].beatHz=Number(e.currentTarget.value); repaint(true); }} /></div> : null}
      {l.type === 'noise' ? <div className="field"><label>Noise color</label><select value={l.noiseColor || 'pink'} onChange={(e:any)=>{ l.noiseColor=e.currentTarget.value; repaint(true); }}><option value="white">white</option><option value="pink">pink</option><option value="brown">brown</option></select></div> : null}
      {l.type !== 'binaural' ? <div className="field"><label>Pan {fmtPan(l.pan || 0)}</label><input type="range" min="-1" max="1" step="0.01" value={String(l.pan || 0)} onInput={(e:any)=>{ l.pan=Number(e.currentTarget.value); repaint(true); }} /></div> : null}
      {l.type !== 'binaural' ? <div className="field"><label>Pan motion Hz</label><input type="range" min="0" max="0.25" step="0.005" value={String(l.panMotion?.rateHz || 0)} onInput={(e:any)=>{ const rateHz=Number(e.currentTarget.value); l.panMotion = rateHz > 0 ? { rateHz, depth:l.panMotion?.depth ?? .35 } : undefined; repaint(true); }} /></div> : null}
      {l.type !== 'binaural' && (l.panMotion?.rateHz || 0) > 0 ? <div className="field"><label>Motion depth</label><input type="range" min="0" max="1" step="0.01" value={String(l.panMotion?.depth || .35)} onInput={(e:any)=>{ l.panMotion = { rateHz:l.panMotion?.rateHz || 0.03, depth:Number(e.currentTarget.value) }; repaint(true); }} /></div> : null}
      {l.type === 'sample' ? <SampleControls l={l} /> : null}
    </div>
    <div className="field"><label>Timeline points</label><TimelineEditor l={l} /></div>
  </div>;
}

function SampleControls({ l }: { l: EntrainLayerV1 }) {
  const loop = l.sampleLoop || { mode:'native', startSec:0, endSec:0, crossfadeSec:3 } as any;
  return <>
    <div className="field"><label>Ambience file</label><input type="file" accept="audio/*" onChange={(e:any)=>loadSample(l.id, e.currentTarget.files?.[0])} /></div>
    <div className="field"><label>Loop mode</label><select value={loop.mode || 'native'} onChange={(e:any)=>{ l.sampleLoop={...loop, mode:e.currentTarget.value}; repaint(true); }}><option value="native">native</option><option value="crossfade">crossfade</option></select></div>
    <div className="field"><label>Loop start sec</label><input type="number" min="0" step="0.1" value={String(loop.startSec || 0)} onInput={(e:any)=>{ l.sampleLoop={...loop, startSec:Number(e.currentTarget.value||0)}; repaint(true); }} /></div>
    <div className="field"><label>Loop end sec</label><input type="number" min="0" step="0.1" value={String(loop.endSec || 0)} onInput={(e:any)=>{ l.sampleLoop={...loop, endSec:Number(e.currentTarget.value||0)}; repaint(true); }} /></div>
    {loop.mode === 'crossfade' ? <div className="field"><label>Crossfade sec</label><input type="number" min="0" max="30" step="0.1" value={String(loop.crossfadeSec || 3)} onInput={(e:any)=>{ l.sampleLoop={...loop, crossfadeSec:Number(e.currentTarget.value||0)}; repaint(true); }} /></div> : null}
  </>;
}

function TimelineEditor({ l }: { l: EntrainLayerV1 }) {
  return <table className="matrix"><thead><tr><th>min</th>{!isNoBeat(l) ? <th>beat</th> : null}<th>gain</th><th></th></tr></thead><tbody>
    {l.keyframes.map((k, i)=><tr key={i}><td><input type="number" min="0" max="180" step="0.5" value={String(k.tMin)} onChange={(e:any)=>{ k.tMin=Number(e.currentTarget.value); l.keyframes.sort((a,b)=>a.tMin-b.tMin); repaint(true); }} /></td>{!isNoBeat(l) ? <td><input type="number" min="0.1" max="45" step="0.1" value={String(k.beatHz || 10)} onChange={(e:any)=>{ k.beatHz=Number(e.currentTarget.value); repaint(true); }} /></td> : null}<td><input type="number" min="0" max="100" step="1" value={String(k.gainPct)} onChange={(e:any)=>{ k.gainPct=Number(e.currentTarget.value); repaint(true); }} /></td><td><button className="btn" onClick={()=>{ if(l.keyframes.length>1) l.keyframes.splice(i,1); repaint(true); }}>x</button></td></tr>)}
    <tr><td colSpan="4"><button className="btn" onClick={()=>{ const last=l.keyframes[l.keyframes.length-1]; l.keyframes.push({tMin:Math.min(session.durationMin, (last?.tMin||0)+5), beatHz:last?.beatHz, gainPct:last?.gainPct ?? 35}); repaint(true); }}>+ point</button></td></tr>
  </tbody></table>;
}

function describeLayer(l: EntrainLayerV1) {
  if (l.type === 'sample') return `${l.sampleName || 'load a file'} · ${l.sampleLoop?.mode || 'native'} loop`;
  if (l.type === 'noise') return `${l.noiseColor || 'pink'} noise`;
  if (l.type === 'carrier') return `${l.carrierHz || 220} Hz carrier`;
  const first = l.keyframes[0]?.beatHz || 10;
  const last = l.keyframes[l.keyframes.length - 1]?.beatHz || first;
  return `${first}${first !== last ? `→${last}` : ''} Hz · carrier ${l.carrierHz || 220} Hz`;
}
function fmtPan(p: number) { return p === 0 ? 'C' : p < 0 ? `${Math.round(Math.abs(p)*100)}L` : `${Math.round(p*100)}R`; }
function normalizeTimelines(){ session.layers.forEach((l)=>{ l.keyframes.forEach((k)=>{ if(k.tMin>session.durationMin) k.tMin=session.durationMin; }); }); }
function ensureTwoKeyframes(l: EntrainLayerV1){ if(l.keyframes.length < 2) l.keyframes.push({...l.keyframes[0], tMin:session.durationMin}); }
function changeType(l: EntrainLayerV1, type: LayerType){ l.type=type; if(isNoCarrier(l)) l.carrierHz=undefined; else l.carrierHz=l.carrierHz || 220; if(type==='binaural'){ l.pan=undefined; l.panMotion=undefined; } if(type==='noise') l.noiseColor=l.noiseColor || 'pink'; if(type==='sample') { l.sampleName=l.sampleName || ''; l.sampleLoop=l.sampleLoop || {mode:'native',startSec:0,endSec:0,crossfadeSec:3}; } }

function addLayer() { session.layers.push({ id: uid(), type:'binaural', carrierHz:220, wave:'sine', keyframes:[{ tMin:0, beatHz:10, gainPct:35 }, { tMin:session.durationMin, beatHz:10, gainPct:35 }] }); repaint(true); }
function addNoise() { session.layers.push({ id: uid(), type:'noise', noiseColor:'pink', pan:0, panMotion:{ rateHz:.02, depth:.16 }, keyframes:[{ tMin:0, gainPct:16 }, { tMin:session.durationMin, gainPct:16 }] }); repaint(true); }
function addAmbience() { session.layers.push({ id: uid(), type:'sample', sampleName:'load a file', pan:0, panMotion:{ rateHz:.03, depth:.35 }, sampleLoop:{mode:'crossfade',startSec:0,endSec:0,crossfadeSec:3}, keyframes:[{ tMin:0, gainPct:22 }, { tMin:session.durationMin, gainPct:22 }] }); repaint(true); }
function duplicateLayer(id: string) { const l=session.layers.find(x=>x.id===id); if(!l)return; session.layers.push({...JSON.parse(JSON.stringify(l)), id:uid(), sampleName:l.type==='sample'?`${l.sampleName || 'sample'} (reload file)`:l.sampleName}); repaint(true); }
function removeLayer(id: string) { session.layers = session.layers.filter((l) => l.id !== id); repaint(true); }
async function loadSample(id: string, file?: File) { if (!file) return; await engine.loadSample(id, file); const l=session.layers.find(x=>x.id===id); if(l) l.sampleName=file.name; notice=`loaded ${file.name}`; repaint(true); }
async function toggle() { if (engine.running) { engine.stop(); status='idle'; } else { await engine.start(); status='running'; draw(); } repaint(); }
function downloadBlob(blob: Blob, filename: string) { const a=document.createElement('a'); const url=URL.createObjectURL(blob); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),60000); }
function exportJson() { session=sanitizeSession(session); downloadBlob(new Blob([JSON.stringify(session, null, 2)],{type:'application/json'}), session.name.replace(/\W+/g,'_')+'.entrain.json'); }
async function exportWav() { exportBusy=true; notice='rendering WAV locally…'; repaint(); try { const r=await engine.renderWav(undefined, session.export?.sampleRate, session.export?.fadeSec); downloadBlob(r.blob, r.filename); notice=`saved ${r.filename} · ${(r.blob.size/1048576).toFixed(1)} MB`; } catch(e:any) { notice=e.message || 'render failed'; } exportBusy=false; repaint(); }
async function importJson(e: any) { const f=e.currentTarget.files?.[0]; if(!f)return; session = sanitizeSession(JSON.parse(await f.text())); engine.stop(); engine = createAudioEngine(() => session); notice='imported session'; repaint(); }
async function copyShareUrl() { const h=await encodeSessionHash(session); const url=location.origin + location.pathname + h; await navigator.clipboard.writeText(url).catch(()=>{}); history.replaceState(null,'',h); notice='share URL copied; ambience files still need to be reloaded by the recipient'; repaint(); }
async function saveServer() { try { const res=await fetch('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:session.name,slug:'custom',session:sanitizeSession(session)})}).then(r=>r.json()); notice=res.ok?'saved to wallet library':(res.error || 'save failed'); } catch(e:any){ notice=e.message || 'save failed'; } repaint(); }
function repaint(rebuild=false) { if (rebuild && engine.running) engine.rebuild(); render(<App />, document.getElementById('studio-root')!); }
function draw(){ if(!engine.running) return; const canvas=document.getElementById('scope-canvas') as HTMLCanvasElement|null; if(canvas) engine.drawScope(canvas); requestAnimationFrame(draw); }

export default async function mount() {
  const shared = await decodeSessionHash().catch(() => null);
  const raw = sessionStorage.getItem('entrain:loaded-session');
  if (shared) { session = shared; notice='loaded shared URL'; }
  else if (raw) { session = sanitizeSession(JSON.parse(raw)); }
  render(<App />, document.getElementById('studio-root')!);
  return () => { engine.stop(); render(null, document.getElementById('studio-root')!); };
}
