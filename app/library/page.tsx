export default function LibraryPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: '14px' }}>
        <h1>Wallet library</h1>
        <p>Saved sessions are attached to the verified wallet session. They store ENTRAIN JSON only; ambience file buffers stay local and must be reloaded.</p>
      </section>
      <section className="console" id="library-root"><div className="panel"><p className="muted">Loading saved sessions…</p></div></section>
    </main>
  );
}
