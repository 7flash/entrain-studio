export default function CreatorPage() {
  return (
    <main>
      <section className="hero">
        <span className="pill unlocked">Creator</span>
        <h1>Creator workspace</h1>
        <p>
          Manage tracks you published into the public catalogue. Studio still
          supports private source-link sharing without login; Google is only for
          saved library and public publishing.
        </p>
      </section>
      <section id="creator-root" />
    </main>
  );
}
