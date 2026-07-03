export default function CreatorPage() {
  return (
    <main>
      <section className="hero">
        <h1>Creator marketplace</h1>
        <p>
          Publish ENTRAIN tracks from Studio into the public catalogue. Free
          tracks unlock instantly; paid tracks require a SOL payment to the
          creator wallet before the pattern JSON is revealed.
        </p>
        <div className="tagrow">
          <a className="btn primary" href="/studio">
            Open Studio
          </a>
          <a className="btn" href="/soundtracks">
            Browse catalogue
          </a>
        </div>
      </section>
      <section className="card" id="creator-root">
        <p className="muted">Loading creator dashboard…</p>
      </section>
    </main>
  );
}
