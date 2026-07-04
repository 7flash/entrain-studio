import { soundtracksByCategory } from "@/lib/soundtracks";

export default function SoundtracksPage() {
  const groups = soundtracksByCategory();
  return (
    <main>
      <section className="hero" style={{ paddingBottom: "10px" }}>
        <span className="pill unlocked">Explore</span>
        <h1>Explore soundtracks</h1>
        <p>
          Prepared catalogue rows come first: Basic, Holosync-style descents,
          and Hemi-Sync-style focus stages. User-published tracks appear after
          the prepared rows. Every soundtrack is free to play, export, inspect,
          and clone.
        </p>
      </section>
      <section className="toolbar explore-toolbar">
        <div className="field explore-search">
          <label>Search catalogue</label>
          <input
            id="explore-search"
            placeholder="Search title, tags, creator, bands…"
          />
        </div>
        <div className="tagrow">
          {groups.map((g: any) => (
            <a className="pill" href={`#${g.category}`} key={g.category}>
              {g.label || g.category} · {g.templates.length}
            </a>
          ))}
        </div>
        <div className="small" id="explore-count"></div>
      </section>
      {groups.map((group) => (
        <section
          key={group.category}
          id={group.category}
          data-explore-group={group.category}
          style={{ marginBottom: "26px" }}
        >
          <h2 style={{ fontFamily: "Georgia,serif", fontWeight: 400 }}>
            {(group as any).label || group.category}
          </h2>
          <div className="grid" id="template-grid">
            {group.templates.map((t) => (
              <article
                className="card template-card unlocked-card"
                data-soundtrack-card={t.slug}
                data-category={group.category}
                data-search={`${t.title} ${t.summary} ${t.description} ${t.creatorName || ""} ${t.tags.join(" ")} ${t.summaryStats.bands.join(" ")}`.toLowerCase()}
                data-min-tokens="0"
                key={t.slug}
              >
                <div className="tagrow">
                  <span className="pill">
                    {(group as any).label || t.category}
                  </span>
                  <span className="pill unlocked">free</span>
                  {t.publishedByUser ? (
                    <span className="pill">user published</span>
                  ) : (
                    <span className="pill">prepared</span>
                  )}
                  {t.lineage?.accuracy ? (
                    <span className="pill">{t.lineage.accuracy}</span>
                  ) : null}
                </div>
                <h3>{t.title}</h3>
                <p className="muted">{t.summary}</p>
                <p className="small">
                  {t.summaryStats.durationMin}m · {t.summaryStats.layerCount}{" "}
                  layers · {t.summaryStats.bands.join("/") || "bed"}
                  {t.summaryStats.hasPanMotion ? " · pan motion" : ""}
                  {t.summaryStats.headphonesRequired ? " · headphones" : ""}
                  {t.summaryStats.sampleLayerCount
                    ? ` · ${t.summaryStats.sampleLayerCount} sample`
                    : ""}
                  {t.summaryStats.proceduralAmbienceLayerCount
                    ? ` · ${t.summaryStats.proceduralAmbienceLayerCount} procedural`
                    : ""}
                </p>
                <p className="small">
                  {t.creatorName ? `by ${t.creatorName} · ` : ""}
                  {t.tags.join(" · ")}
                </p>
                <div style={{ marginTop: "auto" }}>
                  <a className="btn" href={`/soundtracks/${t.slug}`}>
                    Open
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
