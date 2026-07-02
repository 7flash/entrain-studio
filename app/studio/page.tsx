export default function StudioPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: '14px' }}>
        <h1>Create / edit a track</h1>
        <p>The editor is free to use locally: build layers, play them, share JSON, and render WAVs in the browser. Saving to your private library asks for Phantom so the database can attach the session to your wallet.</p>
      </section>
      <section className="console" id="studio-root">
        <div className="panel"><p className="muted">Loading client editor…</p></div>
      </section>
    </main>
  );
}
