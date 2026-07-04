export default function LibraryPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: "14px" }}>
        <h1>Your saved tracks</h1>
        <p>
          Sign in with Google to save unlimited private algorithmic tracks and
          share any one with a simple /shared link. Studio and private # source
          links still work without login.
        </p>
      </section>
      <section className="console" id="library-root">
        <div className="panel">
          <p className="muted">Loading saved tracks…</p>
        </div>
      </section>
    </main>
  );
}
