import { TOKEN_DISPLAY_NAME } from "@/lib/config";
import { findSoundtrack } from "@/lib/soundtracks";
import { analyzeSession, analysisBadge } from "@/format/protocol-analyzer";
import { signalMapForSession, formatSignalPoint } from "@/format/channel-map";
import { formatSol } from "@/lib/marketplace";

const layerName = (l: any) => {
  if (l.type === "sample")
    return `${l.type} · ${l.sampleName || "local file"} · ${l.sampleLoop?.mode || "native"} loop`;
  if (l.type === "noise") return `${l.type} · ${l.noiseColor || "pink"}`;
  if (l.type === "procedural-ambience")
    return `${l.type} · ${l.ambienceRecipe || "pink-rain"} · seed ${l.seed || 1337}`;
  if (l.type === "carrier") return `${l.type} · ${l.carrierHz || 220} Hz`;
  if (l.type === "additive")
    return `${l.type} · ${l.carrierHz || 136.1} Hz base · ${(l.partials || []).length || 3} partials`;
  if (l.type === "karplus")
    return `${l.type} · ${l.carrierHz || 220} Hz pluck · rate ${l.karplus?.rateHz || 0.08} Hz`;
  const first = l.keyframes?.[0]?.beatHz || 0;
  const last = l.keyframes?.[l.keyframes.length - 1]?.beatHz || first;
  return `${l.type} · ${first}${first !== last ? `→${last}` : ""} Hz · ${l.carrierHz || 220} Hz carrier`;
};

type Props = { params: { slug: string } };

export default function SoundtrackDetailPage({ params }: Props) {
  const template = findSoundtrack(params.slug);
  if (!template) {
    return (
      <main className="hero">
        <h1>Soundtrack not found</h1>
        <p>
          <a href="/soundtracks">Back to soundtracks</a>
        </p>
      </main>
    );
  }
  const priceLamports = Number(template.market?.priceLamports || 0);
  const req =
    priceLamports > 0
      ? `${formatSol(priceLamports)} creator access`
      : template.minTokens
        ? `${template.minTokens} ${TOKEN_DISPLAY_NAME} required`
        : "Free soundtrack";
  const analysis = analyzeSession(template.session);
  const lineage = template.lineage;
  const ref = template.referenceMatch;
  const unlockedPublic = template.minTokens <= 0 && priceLamports <= 0;
  const signalMap = unlockedPublic
    ? signalMapForSession(template.session)
    : null;
  return (
    <main>
      <section className="hero">
        <div className="tagrow">
          <span className={template.minTokens ? "pill gate" : "pill unlocked"}>
            {req}
          </span>
          <span className={`pill tier-${template.tier}`}>{template.tier}</span>
          <span className="pill">{template.category}</span>
          {template.publishedByUser ? (
            <span className="pill">
              by {template.creatorName || "community creator"}
            </span>
          ) : null}
        </div>
        <h1>{template.title}</h1>
        <p>{template.summary}</p>
        <div className="tagrow">
          {template.tags.map((x) => (
            <span className="pill" key={x}>
              {x}
            </span>
          ))}
        </div>
      </section>

      <section className="two">
        <article className="card">
          <h3>What this soundtrack is</h3>
          <p className="muted">{template.description}</p>
          {template.unlockNote ? (
            <p className="notice">{template.unlockNote}</p>
          ) : null}
          {priceLamports > 0 ? (
            <p className="notice">
              <strong>Creator marketplace:</strong> Buy lifetime access for{" "}
              {formatSol(priceLamports)}. Payment goes directly to the creator
              payout wallet.
            </p>
          ) : null}
          <p className="notice good">
            This page can play the database format directly. Unlocking returns
            only the ENTRAIN JSON; audio generation and WAV rendering stay local
            in your browser.
          </p>
          <div className="notice">
            <strong>Protocol analyzer: {analysisBadge(analysis)}</strong>
            <br />
            <span className="small">
              {analysis.headphonesRequired
                ? "Stereo headphones required"
                : "No binaural headphone requirement"}{" "}
              · peak {analysis.estimatedPeakDb.toFixed(1)} dBFS ·{" "}
              {analysis.mixStatus} · loop{" "}
              {template.session.loop?.mode || "hold-last"}
            </span>
            {analysis.issues.length ? (
              <ul className="small">
                {analysis.issues.slice(0, 4).map((i) => (
                  <li key={i.code}>
                    {i.level}: {i.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {lineage ? (
            <div className="notice">
              <strong>Lineage: {lineage.accuracy || "inspired"}</strong>
              <br />
              <span className="small">
                {lineage.sourceLabel || "Source metadata declared by publisher"}
                {lineage.referenceId
                  ? ` · reference ${lineage.referenceId}`
                  : ""}
              </span>
              {lineage.disclosure ? (
                <p className="small">{lineage.disclosure}</p>
              ) : null}
              {lineage.intentionalDifferences?.length ? (
                <ul className="small">
                  {lineage.intentionalDifferences.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
              {ref ? (
                <p className="small">
                  <b>Reference check:</b>{" "}
                  {ref.matches
                    ? "matches declared reference"
                    : "differs from declared reference"}{" "}
                  · score {ref.score}/100
                </p>
              ) : null}
              {unlockedPublic && ref?.deviations.length ? (
                <ul className="small">
                  {ref.deviations.slice(0, 6).map((d) => (
                    <li key={d.code + d.message}>
                      {d.level}: {d.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!unlockedPublic && ref?.deviations.length ? (
                <p className="small">
                  Detailed deviation list unlocks with the playable pattern.
                </p>
              ) : null}
            </div>
          ) : null}
          <div
            id="soundtrack-player-root"
            data-slug={template.slug}
            data-min-tokens={String(template.minTokens)}
          >
            <p className="muted">Loading player…</p>
          </div>
        </article>
        <article className="card">
          <h3>{unlockedPublic ? "Signal map" : "Locked signal map"}</h3>
          <p className="small">
            Pattern length: {template.session.durationMin} minutes ·{" "}
            {template.session.layers.length} layers · fade{" "}
            {template.session.export?.fadeSec ?? 4}s · loop{" "}
            {template.session.loop?.mode || "hold-last"}
          </p>
          <p className="small">
            Bands: {template.summaryStats.bands.join(" / ") || "bed"} · beat
            layers {template.summaryStats.beatLayerCount} · sample layers{" "}
            {template.summaryStats.sampleLayerCount}
            {template.summaryStats.proceduralAmbienceLayerCount
              ? ` · ${template.summaryStats.proceduralAmbienceLayerCount} procedural ambience`
              : ""}
            {template.summaryStats.hasCrossfadedSamples
              ? " · crossfade loops"
              : ""}
          </p>
          {!unlockedPublic ? (
            <p className="notice">
              Exact layer/keyframe data is part of the gated soundtrack pattern.
              Unlock the player to view the full left/right frequency map and
              render it locally.
            </p>
          ) : null}
          {signalMap ? (
            <table className="matrix">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Formula</th>
                  <th>Keyframes</th>
                </tr>
              </thead>
              <tbody>
                {signalMap.layers.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.label}
                      <br />
                      <span className="small">
                        {l.panNote ||
                          (l.requiresHeadphones ? "headphones required" : "")}
                      </span>
                    </td>
                    <td>{l.formula}</td>
                    <td>
                      {l.points
                        .map((p: any) => formatSignalPoint(p))
                        .join(" → ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </article>
      </section>
    </main>
  );
}
