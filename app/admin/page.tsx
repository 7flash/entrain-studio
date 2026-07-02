export default function AdminPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: '14px' }}>
        <span className="pill">database rows · ENTRAIN format · publish gates</span>
        <h1>Admin soundtrack manager</h1>
        <p>Create and edit the prepared brainwave soundtrack rows. Each row stores public metadata plus the ENTRAIN session JSON that the player/editor can run.</p>
        <p className="notice">This scaffold uses an <span className="mono">ADMIN_TOKEN</span> header/token for admin writes. Keep it server-side and replace it with your preferred role system before production.</p>
      </section>
      <section className="console" id="admin-root">
        <div className="panel"><p className="muted">Loading admin client…</p></div>
      </section>
    </main>
  );
}
