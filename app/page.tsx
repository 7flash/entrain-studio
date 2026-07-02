import { featuredTemplates } from '@/lib/templates';

export default function HomePage() {
  const featured = featuredTemplates(3);
  return (
    <main>
      <section className="hero">
        <span className="pill">template format · token gates · local render · share URLs</span>
        <h1>A server-backed console for gated entrainment templates.</h1>
        <p>ENTRAIN has its own session format, a template library, Phantom holder gates, wallet-saved sessions, and compressed share URLs. Audio still renders locally in the browser; access decisions live on the TradJS server.</p>
        <p><a className="btn primary" href="/templates">Browse templates</a> <a className="btn" href="/studio">Open studio</a> <a className="btn" href="/library">Wallet library</a></p>
      </section>
      <section className="grid">
        {featured.map((t) => (
          <article className="card template-card" key={t.slug}>
            <div className="tagrow"><span className="pill">{t.category}</span><span className={`pill tier-${t.tier}`}>{t.tier}</span><span className="pill">{t.minTokens ? `${t.minTokens} $ENTRAIN` : 'free'}</span></div>
            <h3>{t.title}</h3>
            <p className="muted">{t.summary}</p>
            <a className="btn" href={`/templates/${t.slug}`}>View template</a>
          </article>
        ))}
      </section>
    </main>
  );
}
