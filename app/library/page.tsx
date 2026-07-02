export default function LibraryPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: '14px' }}>
        <h1>Private library</h1>
        <p>Your saved tracks are attached to your verified Phantom wallet. Rows store ENTRAIN JSON only; ambience file buffers stay local and must be reloaded when a saved track uses a sample layer.</p>
      </section>
      <section className="console" id="library-root"><div className="panel"><p className="muted">Loading saved tracks…</p></div></section>
    </main>
  );
}
