import { render, navigate } from 'tradjs/client';
import { connectAndVerify, getWalletState, type WalletState } from '@/client/wallet';

let state: WalletState = { authenticated:false, publicKey:null, balance:0 };
let sessions: any[] = [];
let message = '';

function App(){
  return <div className="panel">
    <div className="toolbar">
      <div><strong>{state.authenticated ? `Wallet ${state.publicKey?.slice(0,4)}…${state.publicKey?.slice(-4)}` : 'Connect wallet'}</strong><div className="small">{message || (state.authenticated ? `${sessions.length} saved tracks` : 'Wallet session required to list saved tracks.')}</div></div>
      <button className="btn primary" onClick={connect}>{state.authenticated ? 'Reconnect' : 'Connect Phantom'}</button>
    </div>
    <div className="list">
      {sessions.map((s)=><article className="card" key={s.id || s.createdAt}>
        <div className="toolbar"><div><h3>{s.name}</h3><div className="small">{s.slug} · {new Date(s.createdAt).toLocaleString()}</div></div><button className="btn" onClick={()=>openSession(s)}>Open in editor</button></div>
      </article>)}
      {state.authenticated && !sessions.length ? <p className="muted">No saved tracks yet. Save from the studio.</p> : null}
    </div>
  </div>;
}
async function connect(){ try { state = await connectAndVerify(); await load(); } catch(e:any){ message=e.message || 'connect failed'; paint(); } }
async function load(){ const r=await fetch('/api/sessions').then(x=>x.json()).catch(()=>({ok:false,error:'failed'})); if(!r.ok){message=r.error || 'load failed'; sessions=[];} else {sessions=r.sessions || []; message='';} paint(); }
function openSession(s:any){ sessionStorage.setItem('entrain:loaded-session', JSON.stringify(s.session)); navigate('/studio?saved=1'); }
function paint(){ render(<App />, document.getElementById('library-root')!); }
export default async function mount(){ state = await getWalletState(); if(state.authenticated) await load(); else paint(); return ()=>render(null, document.getElementById('library-root')!); }
