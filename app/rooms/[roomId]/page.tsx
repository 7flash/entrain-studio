import { getSyncRoom } from "@/lib/sync-rooms";
import { findSoundtrack } from "@/lib/soundtracks";
import { analyzeSession, analysisBadge } from "@/format/protocol-analyzer";

export default function RoomDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  const room = getSyncRoom(String(params.roomId || "").toUpperCase());
  const soundtrack = room ? findSoundtrack(room.slug) : null;
  if (!room || !soundtrack) {
    return (
      <main className="hero">
        <span className="pill locked">room offline</span>
        <h1>Room not found</h1>
        <p>This meditation room expired or the soundtrack was removed.</p>
        <p>
          <a className="btn" href="/rooms">
            Back to rooms
          </a>
        </p>
      </main>
    );
  }
  const analysis = analyzeSession(soundtrack.session);
  return (
    <main className="room-detail-page">
      <section className="hero room-hero">
        <div className="tagrow">
          <span className="pill unlocked">synced meditation room</span>
          <span className="pill mono">{room.roomId}</span>
          <span className="pill">{room.state}</span>
        </div>
        <h1>{room.title || soundtrack.title}</h1>
        <p>{soundtrack.summary}</p>
        <p className="small">
          Everyone hears the same soundtrack position. Phantom is optional;
          connected listeners can earn internal room rewards while the room is
          playing.
        </p>
      </section>
      <section className="room-detail-grid">
        <article className="card room-player-shell">
          <div
            id="room-player-root"
            data-room-id={room.roomId}
            data-slug={soundtrack.slug}
          >
            <p className="muted">Loading room player…</p>
          </div>
        </article>
        <aside className="card room-info-shell">
          <h3>Soundtrack source</h3>
          <p className="small">
            Pattern length: {soundtrack.session.durationMin} min ·{" "}
            {soundtrack.session.layers.length} layers · loop{" "}
            {soundtrack.session.loop?.mode || "hold-last"}
          </p>
          <p className="small">
            Analyzer: {analysisBadge(analysis)} · peak{" "}
            {analysis.estimatedPeakDb.toFixed(1)} dBFS ·{" "}
            {analysis.headphonesRequired
              ? "headphones required"
              : "speaker/headphone capable"}
          </p>
          <pre className="scriptbox mono room-scriptbox">
            {soundtrack.scriptText || "# source script unavailable"}
          </pre>
        </aside>
      </section>
    </main>
  );
}
