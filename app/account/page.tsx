export default function AccountPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: "14px" }}>
        <span className="pill unlocked">personal account</span>
        <h1>Your account</h1>
        <p>
          Connect Phantom to see private library access, room reward balance,
          withdrawal requests, and account profile. Studio still works without
          login.
        </p>
      </section>
      <section className="console" id="account-root">
        <div className="panel">
          <p className="muted">Loading account…</p>
        </div>
      </section>
    </main>
  );
}
