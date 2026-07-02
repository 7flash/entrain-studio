import { render, navigate } from 'tradjs/client';
import { sanitizeSession, type EntrainSessionV1 } from '@/format/entrain-format';
import { createAudioEngine } from '@/client/audio-engine';
import { connectAndVerify, getWalletState, refreshWalletBalance, type WalletState } from '@/client/wallet';

let slug = '';
let session: EntrainSessionV1 | null = null;
let engine = createAudioEngine(() => session!);
let wallet: WalletState = { authenticated:false, publicKey:null, balance:0 };
let message = 'Load this soundtrack to check access.';
let busy = false;
let exportMinutes = 30;
let repetitions = 1;
let loadedTitle = '';

function App() {
  const locked = !session;
  return <div>
    <div className="toolbar">
      <div>
        <strong>{loadedTitle || 'Soundtrack player'}</strong>
        <div className="small">{message}</div>
        {wallet.authenticated ? <div className="small">Wallet {wallet.publicKey?.slice(0,4)}…{wallet.publicKey?.slice(-4)} · {wallet.balance} $ENTRAIN</div> : null}
      </div>
      <div className="tagrow">
        <button className="btn primary" disabled={busy} onClick={unlock}>{session ? 'Reload access' : 'Unlock / load'}</button>
        <button className="btn" disabled={busy || locked} onClick={toggleForever}>{engine.running ? 'Stop' : 'Play forever'}</button>
        <button className="btn" disabled={busy || locked} onClick={cloneToEditor}>Clone to editor</button>
        <button className="btn" disabled={busy || locked} onClick={saveToLibrary}>Clone to private library</button>
      </div>
    </div>

    <div className="scope" style={{ margin: '12px 0' }}><canvas id="soundtrack-scope" /></div>

    <div className="two">
      <div className="field">
        <label>Export exact length, minutes</label>
        <input type="number" min="1" max="180" step="1" value={String(exportMinutes)} onInput={(e:any)=>{ exportMinutes=Number(e.currentTarget.value || 1); paint(); }} />
        <button className="btn" disabled={busy || locked} onClick={exportLength}>{busy ? 'Rendering…' : 'Render exact length'}</button>
      </div>
      <div className="field">
        <label>Export repetitions of pattern</label>
        <input type="number" min="1" max="24" step="1" value={String(repetitions)} onInput={(e:any)=>{ repetitions=Number(e.currentTarget.value || 1); paint(); }} />
        <button className="btn" disabled={busy || locked} onClick={exportRepeats}>{busy ? 'Rendering…' : 'Render repetitions'}</button>
      </div>
    </div>

    <p className="small">Exact-length export loops the soundtrack pattern until the requested length. Repetition export renders the pattern length × repetitions. Ambience/sample rows keep filename and loop metadata, but the local audio file must be loaded in the editor before it can appear in exports.</p>
  </div>;
}

async function unlock() {
  busy = true; message = 'checking access…'; paint();
  try {
    let res = await fetch(`/api/access?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
    if (!res.ok && res.requiresWallet) {
      message = 'connect Phantom and sign to unlock…'; paint();
      wallet = await connectAndVerify();
      res = await fetch(`/api/access?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
    }
    if (!res.ok && res.staleBalance) {
      message = 'refreshing token balance…'; paint();
      wallet = await refreshWalletBalance();
      res = await fetch(`/api/access?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
    }
    if (!res.ok) throw new Error(res.error || 'locked');
    session = sanitizeSession(res.template.session);
    loadedTitle = res.template.title || session.name;
    engine.stop(); engine = createAudioEngine(() => session!);
    message = 'loaded. You can play forever, export a looped WAV, or clone it.';
  } catch (e: any) {
    message = e.message || 'unlock failed';
  } finally {
    busy = false; paint();
  }
}

async function toggleForever() {
  if (!session) return;
  if (engine.running) { engine.stop(); message = 'stopped'; paint(); return; }
  await engine.start({ loopPattern:true });
  message = 'playing continuously; pattern is loop-scheduled.'; paint(); draw();
}

async function exportLength() {
  if (!session) return;
  busy = true; message = 'rendering exact-length WAV locally…'; paint();
  try {
    const seconds = Math.max(1, Math.min(180, exportMinutes || session.durationMin)) * 60;
    const r = await engine.renderWav(seconds, session.export?.sampleRate, session.export?.fadeSec, { loopPattern:true });
    downloadBlob(r.blob, r.filename);
    message = `saved ${r.filename} · ${(r.blob.size/1048576).toFixed(1)} MB`;
  } catch(e:any) { message = e.message || 'render failed'; }
  busy = false; paint();
}

async function exportRepeats() {
  if (!session) return;
  busy = true; message = 'rendering repeated-pattern WAV locally…'; paint();
  try {
    const reps = Math.max(1, Math.min(24, repetitions || 1));
    const seconds = session.durationMin * 60 * reps;
    const r = await engine.renderWav(seconds, session.export?.sampleRate, session.export?.fadeSec, { loopPattern:true, repetitions: reps });
    downloadBlob(r.blob, r.filename);
    message = `saved ${r.filename} · ${(r.blob.size/1048576).toFixed(1)} MB`;
  } catch(e:any) { message = e.message || 'render failed'; }
  busy = false; paint();
}

function cloneToEditor() {
  if (!session) return;
  const copy = sanitizeSession({ ...session, name: `${session.name} — clone` });
  sessionStorage.setItem('entrain:loaded-session', JSON.stringify(copy));
  navigate(`/studio?clone=${encodeURIComponent(slug)}`);
}

async function saveToLibrary() {
  if (!session) return;
  const copy = sanitizeSession({ ...session, name: `${session.name} — clone` });
  busy = true; message = 'saving private clone…'; paint();
  try {
    let res = await postSession(copy);
    if (!res.ok && res.error && /wallet/i.test(res.error)) {
      wallet = await connectAndVerify();
      res = await postSession(copy);
    }
    if (!res.ok) throw new Error(res.error || 'save failed');
    message = 'saved private clone. Open it from your library.';
  } catch(e:any) { message = e.message || 'save failed'; }
  busy = false; paint();
}

async function postSession(s: EntrainSessionV1) {
  return await fetch('/api/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:s.name,slug,session:s})}).then(r=>r.json());
}
function downloadBlob(blob: Blob, filename: string) { const a=document.createElement('a'); const url=URL.createObjectURL(blob); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),60000); }
function paint(){ render(<App />, document.getElementById('soundtrack-player-root')!); }
function draw(){ if(!engine.running)return; const c=document.getElementById('soundtrack-scope') as HTMLCanvasElement|null; if(c)engine.drawScope(c); requestAnimationFrame(draw); }

export default async function mount() {
  const root = document.getElementById('soundtrack-player-root')!;
  slug = root.dataset.slug || '';
  wallet = await getWalletState().catch(() => wallet);
  paint();
  if (Number(root.dataset.minTokens || '0') <= 0) unlock();
  return () => { engine.stop(); render(null, root); };
}
