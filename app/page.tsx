import { featuredSoundtracks } from "@/lib/soundtracks";

export default function HomePage() {
  const featured = featuredSoundtracks(3);
  return (
    <main>
      <section className="hero">
        <span className="pill unlocked">
          ENTRAIN format · browser player · public catalogue · local-first
          studio · Google saves
        </span>
        <h1>Create your own tracks, or play ready brainwave soundtracks.</h1>
        <p>
          Every track is stored as a source script plus compiled ENTRAIN runtime
          cache: layers, beat timelines, carrier glides, ambience-loop metadata,
          pan motion, name, and description. The browser player runs that format
          live, renders WAVs locally, and clones any soundtrack into the editor
          without login. Google is optional only for persistent private library
          saves and publishing selected tracks into the community catalogue.
        </p>
        <p>
          <a className="btn primary" href="/studio">
            Create a track
          </a>{" "}
          <a className="btn" href="/explore">
            Explore soundtracks
          </a>
        </p>
      </section>

      <section className="two">
        <article className="card">
          <h3>No-login Studio</h3>
          <p className="muted">
            Build a track from scratch, play it, import/export JSON, share it
            privately by URL hash, and render a WAV locally. Creation and exact
            # sharing need no login. Sign in with Google only when you want
            persistent private saves, /shared links, or to publish a selected
            track publicly.
          </p>
          <p>
            <a className="btn primary" href="/studio?new=1">
              Open editor
            </a>{" "}
            <a className="btn" href="/library">
              Saved tracks
            </a>
          </p>
        </article>
        <article className="card">
          <h3>Prepared soundtracks</h3>
          <p className="muted">
            Published rows in the database appear as ready soundtracks. Explore
            starts with prepared/admin-curated categories, then shows
            user-published tracks from signed-in creators.
          </p>
          <p>
            <a className="btn" href="/explore">
              Open Explore
            </a>{" "}
            <a className="btn" href="/creator">
              Creator workspace
            </a>
          </p>
        </article>
      </section>

      <section style={{ marginTop: "26px" }}>
        <div className="toolbar">
          <h2 style={{ fontFamily: "Georgia,serif", fontWeight: 400 }}>
            Featured soundtracks
          </h2>
          <a className="btn" href="/explore">
            View all
          </a>
        </div>
        <div className="grid">
          {featured.map((t) => (
            <article className="card template-card unlocked-card" key={t.slug}>
              <div className="tagrow">
                <span className="pill">{t.category}</span>
                <span className="pill unlocked">free</span>
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
