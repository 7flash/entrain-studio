import { findTemplate } from '@/lib/templates';

const layerName = (l: any) => {
  if (l.type === 'sample') return `${l.type} · ${l.sampleName || 'local file'} · ${l.sampleLoop?.mode || 'native'} loop`;
  if (l.type === 'noise') return `${l.type} · ${l.noiseColor || 'pink'}`;
  if (l.type === 'carrier') return `${l.type} · ${l.carrierHz || 220} Hz`;
  const first = l.keyframes?.[0]?.beatHz || 0;
  const last = l.keyframes?.[l.keyframes.length - 1]?.beatHz || first;
  return `${l.type} · ${first}${first !== last ? `→${last}` : ''} Hz · ${l.carrierHz || 220} Hz carrier`;
};

type Props = { params: { slug: string } };

export default function TemplateDetailPage({ params }: Props) {
  const template = findTemplate(params.slug);
  if (!template) {
    return <main className="hero"><h1>Template not found</h1><p><a href="/templates">Back to templates</a></p></main>;
  }
  const req = template.minTokens ? `${template.minTokens} $ENTRAIN required` : 'Free template';
  return (
    <main>
      <section className="hero">
        <div className="tagrow">
          <span className={template.minTokens ? 'pill gate' : 'pill unlocked'}>{req}</span>
          <span className={`pill tier-${template.tier}`}>{template.tier}</span>
          <span className="pill">{template.category}</span>
        </div>
        <h1>{template.title}</h1>
        <p>{template.summary}</p>
        <div className="tagrow">{template.tags.map((x) => <span className="pill" key={x}>{x}</span>)}</div>
      </section>
      <section className="two">
        <article className="card">
          <h3>What this session does</h3>
          <p className="muted">{template.description}</p>
          {template.unlockNote ? <p className="notice">{template.unlockNote}</p> : null}
          <p className="notice good">Audio generation and WAV rendering stay local in the browser. The server only returns locked template JSON after the token gate passes.</p>
          <p><button className="btn primary" id="launch-template" data-slug={template.slug}>Load in studio</button></p>
          <div id="detail-auth-root" />
        </article>
        <article className="card">
          <h3>Session structure</h3>
          <p className="small">{template.session.durationMin} minutes · {template.session.layers.length} layers · fade {template.session.export?.fadeSec ?? 4}s</p>
          <table className="matrix">
            <thead><tr><th>Layer</th><th>Timeline</th></tr></thead>
            <tbody>{template.session.layers.map((l) => <tr key={l.id}><td>{layerName(l)}</td><td>{l.keyframes.map((k:any)=>`${k.tMin}m:${k.beatHz ? `${k.beatHz}Hz/` : ''}${k.gainPct}%`).join(' → ')}</td></tr>)}</tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
