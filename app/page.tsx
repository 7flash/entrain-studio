import { featuredSoundtracks } from "@/lib/soundtracks";
import { TOKEN_DISPLAY_NAME } from "@/lib/config";

export default function HomePage() {
  const featured = featuredSoundtracks(3);
  return (
    <main>
      <section className="hero">
        <span className="pill">
          ENTRAIN format · browser player · wallet library · token-gated catalog
          · creator marketplace
        </span>
        <h1>Create your own tracks, or unlock ready brainwave soundtracks.</h1>
        <p>
          Every track is stored as ENTRAIN JSON: layers, beat timelines,
          ambience-loop metadata, pan motion, name, and description. The browser
          player can run that format live, render WAVs locally, and clone any
          unlocked soundtrack into your own editor.
        </p>
        <p>
          <a className="btn primary" href="/studio">
            Create a track
          </a>{" "}
          <a className="btn" href="/soundtracks">
            Browse soundtracks
          </a>{" "}
          <a className="btn" href="/library">
            Private library
          </a>{" "}
          <a className="btn" href="/creator">
            Creator dashboard
          </a>
        </p>
        <div id="token-market-root" />
      </section>

      <section className="two">
        <article className="card">
          <h3>Free editor</h3>
          <p className="muted">
            Build a track from scratch, play it, import/export JSON, share it by
            URL hash, and render a WAV without a login. Saving to your private
            cloud-backed library requires Phantom authorization. You can also
            publish a finished track into the public catalogue and set a creator
            price.
          </p>
          <p>
            <a className="btn primary" href="/studio?new=1">
              Open editor
            </a>
          </p>
        </article>
        <article className="card">
          <h3>Prepared soundtracks</h3>
          <p className="muted">
            Published rows in the database appear as ready soundtracks. Free
            rows open immediately; holder/pro/collector rows require the
            configured {TOKEN_DISPLAY_NAME} balance in the connected wallet.
          </p>
          <p>
            <a className="btn" href="/soundtracks">
              Open catalog
            </a>
          </p>
        </article>
      </section>

      <section className="card" style={{ marginTop: "26px" }}>
        <h3>Creator marketplace</h3>
        <p className="muted">
          Creators can publish original ENTRAIN-format soundtracks from Studio.
          Paid creator tracks are hidden until the listener buys access with
          Phantom; the SOL payment goes directly to the creator payout wallet,
          then the server verifies the transaction before revealing the playable
          pattern JSON.
        </p>
        <p>
          <a className="btn" href="/creator">
            Creator dashboard
          </a>{" "}
          <a className="btn" href="/studio">
            Publish from Studio
          </a>
        </p>
      </section>

      <section style={{ marginTop: "26px" }}>
        <div className="toolbar">
          <h2 style={{ fontFamily: "Georgia,serif", fontWeight: 400 }}>
            Featured soundtracks
          </h2>
          <a className="btn" href="/soundtracks">
            View all
          </a>
        </div>
        <div className="grid">
          {featured.map((t) => (
            <article className="card template-card" key={t.slug}>
              <div className="tagrow">
                <span className="pill">{t.category}</span>
                <span className={`pill tier-${t.tier}`}>{t.tier}</span>
                <span className="pill">
                  {t.minTokens
                    ? `${t.minTokens} ${TOKEN_DISPLAY_NAME}`
                    : "free"}
                </span>
              </div>
              <h3>{t.title}</h3>
              <p className="muted">{t.summary}</p>
              <p className="small">
                {t.summaryStats.durationMin}m · {t.summaryStats.layerCount}{" "}
                layers · {t.summaryStats.bands.join("/") || "bed"}
              </p>
              <a className="btn" href={`/soundtracks/${t.slug}`}>
                Open soundtrack
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
