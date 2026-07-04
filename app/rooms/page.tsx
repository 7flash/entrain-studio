export default function RoomsPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: "14px" }}>
        <span className="pill unlocked">synced listening</span>
        <h1>Meditation rooms</h1>
        <p>
          Listen to the same prepared soundtrack with other people. Audio is
          still generated locally in each browser, but room timing keeps
          everyone on the same soundtrack position.
        </p>
        <p className="small">
          Anyone can join and stay synced. Connect Phantom before joining if you
          want internal room rewards to accrue while the room is playing.
        </p>
      </section>
      <section className="console" id="rooms-root">
        <div className="panel">
          <p className="muted">Loading meditation rooms…</p>
        </div>
      </section>
    </main>
  );
}
