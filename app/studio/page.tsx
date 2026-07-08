export default function StudioPage() {
  return (
    <main className="studio-page">
      <section className="studio-hero">
        <div className="kicker">A tone console for attention</div>
        <h1>
          ENTRAIN <em>Studio</em>
        </h1>
        <p className="lede">
          Build layered binaural, isochronic, ambience, and SBaGen-compatible
          sessions, then export a Studio URL, Widget URL, iframe embed, or WAV.
        </p>
      </section>
      <section className="console studio-root-console" id="studio-root">
        <div className="panel">
          <p className="muted">Loading client editor…</p>
        </div>
      </section>
    </main>
  );
}
