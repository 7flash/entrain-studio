import { render } from 'tradjs/client';
import { defaultSession, sanitizeSession } from '@/format/entrain-format';

let adminToken = localStorage.getItem('entrain:admin-token') || '';
let rows: any[] = [];
let selected: any = freshRow();
let message = '';
let busy = false;

function freshRow() {
  const session = defaultSession();
  return {
    slug: 'new-soundtrack', title: session.name, summary: '', description: '', category: 'custom',
    tags: 'custom', minTokens: 0, unlockNote: '', sortOrder: 100, isPublished: true,
    sessionText: JSON.stringify(session, null, 2),
  };
}

function App() {
  return <div className="panel">
    <div className="toolbar">
      <div>
        <strong>Prepared soundtrack rows</strong>
        <div className="small">{message || `${rows.length} rows loaded`}</div>
      </div>
      <div className="tagrow">
        <input style={{ width:'220px' }} type="password" placeholder="ADMIN_TOKEN" value={adminToken} onInput={(e:any)=>{adminToken=e.currentTarget.value; localStorage.setItem('entrain:admin-token',adminToken);}} />
        <button className="btn primary" disabled={busy} onClick={loadRows}>Load</button>
        <button className="btn" onClick={()=>{selected=freshRow(); paint();}}>New</button>
      </div>
    </div>

    <div className="studio-grid">
      <aside>
        <div className="list">
          {rows.map((r)=><button className="preset btn" style={{ textAlign:'left', display:'block' }} key={r.slug} onClick={()=>editRow(r)}>
            <strong>{r.title}</strong><br />
            <span className="small">/{r.slug} · {r.minTokens ? `${r.minTokens} tokens` : 'free'} · {r.isPublished ? 'published' : 'draft'}</span>
          </button>)}
        </div>
      </aside>
      <section>
        <div className="two">
          <Field label="Slug"><input value={selected.slug} onInput={(e:any)=>{selected.slug=e.currentTarget.value; paint();}} /></Field>
          <Field label="Title"><input value={selected.title} onInput={(e:any)=>{selected.title=e.currentTarget.value; paint();}} /></Field>
          <Field label="Category"><input value={selected.category} onInput={(e:any)=>{selected.category=e.currentTarget.value; paint();}} /></Field>
          <Field label="Minimum $ENTRAIN"><input type="number" min="0" value={String(selected.minTokens)} onInput={(e:any)=>{selected.minTokens=Number(e.currentTarget.value||0); paint();}} /></Field>
          <Field label="Tags, comma separated"><input value={selected.tags} onInput={(e:any)=>{selected.tags=e.currentTarget.value; paint();}} /></Field>
          <Field label="Sort order"><input type="number" value={String(selected.sortOrder)} onInput={(e:any)=>{selected.sortOrder=Number(e.currentTarget.value||0); paint();}} /></Field>
        </div>
        <Field label="Summary"><textarea rows={2} value={selected.summary} onInput={(e:any)=>{selected.summary=e.currentTarget.value; paint();}} /></Field>
        <Field label="Description"><textarea rows={4} value={selected.description} onInput={(e:any)=>{selected.description=e.currentTarget.value; paint();}} /></Field>
        <Field label="Unlock note"><textarea rows={2} value={selected.unlockNote} onInput={(e:any)=>{selected.unlockNote=e.currentTarget.value; paint();}} /></Field>
        <label className="pill"><input type="checkbox" checked={!!selected.isPublished} onChange={(e:any)=>{selected.isPublished=!!e.currentTarget.checked; paint();}} /> published</label>
        <Field label="ENTRAIN session JSON"><textarea className="mono" rows={18} value={selected.sessionText} onInput={(e:any)=>{selected.sessionText=e.currentTarget.value;}} /></Field>
        <div className="tagrow">
          <button className="btn primary" disabled={busy} onClick={saveRow}>Save soundtrack row</button>
          <button className="btn" disabled={busy} onClick={loadFromEditor}>Use current editor session</button>
          <button className="btn warn" disabled={busy} onClick={deleteRow}>Delete / unpublish</button>
        </div>
      </section>
    </div>
  </div>;
}

function Field({ label, children }: { label:string; children:any }) { return <div className="field"><label>{label}</label>{children}</div>; }
function editRow(r:any){ selected={...r, tags:Array.isArray(r.tags)?r.tags.join(', '):r.tags, sessionText:JSON.stringify(r.session,null,2)}; paint(); }
async function loadRows(){ busy=true; message='loading…'; paint(); try{ const res=await fetch('/api/admin/soundtracks',{headers:{'x-admin-token':adminToken}}).then(r=>r.json()); if(!res.ok) throw new Error(res.error||'load failed'); rows=res.soundtracks||[]; message='loaded'; } catch(e:any){ message=e.message||'load failed'; } busy=false; paint(); }
function loadFromEditor(){ const raw=sessionStorage.getItem('entrain:admin-draft') || sessionStorage.getItem('entrain:loaded-session'); if(!raw){ message='No session in editor handoff. Open/save something in Studio first.'; paint(); return; } selected.sessionText=JSON.stringify(sanitizeSession(JSON.parse(raw)),null,2); message='copied session from browser handoff'; paint(); }
async function saveRow(){ busy=true; message='saving…'; paint(); try{ const session=sanitizeSession(JSON.parse(selected.sessionText)); const body={...selected, action:'upsert', adminToken, tags:String(selected.tags||'').split(',').map((x)=>x.trim()).filter(Boolean), session}; delete (body as any).sessionText; const res=await fetch('/api/admin/soundtracks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()); if(!res.ok) throw new Error(res.error||'save failed'); message='saved'; await loadRows(); } catch(e:any){ message=e.message||'save failed'; busy=false; paint(); } }
async function deleteRow(){ if(!confirm(`Delete/unpublish ${selected.slug}?`)) return; busy=true; message='deleting…'; paint(); try{ const res=await fetch('/api/admin/soundtracks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({adminToken,action:'delete',slug:selected.slug})}).then(r=>r.json()); if(!res.ok) throw new Error(res.error||'delete failed'); selected=freshRow(); message='deleted'; await loadRows(); } catch(e:any){ message=e.message||'delete failed'; busy=false; paint(); } }
function paint(){ render(<App />, document.getElementById('admin-root')!); }
export default function mount(){ paint(); loadRows(); return ()=>render(null, document.getElementById('admin-root')!); }
