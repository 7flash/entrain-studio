export default function LandingPage() {
  return (
    <main className="landing wrap">
      <section className="hero">
        <div className="kicker">neuroacoustic entrainment studio</div>
        <h1>
          ENTRAIN <em>Studio</em>
        </h1>
        <p className="lede">
          Compose binaural, monaural, and isochronic soundtracks in the
          browser — and lock your gaze on a target that jumps once per beat,
          driven by the exact same glide the audio follows.
        </p>
        <div className="btnrow landing-cta">
          <a className="btn primary" href="/studio">
            Open Studio
          </a>
          <a
            className="btn"
            href="https://github.com/7flash/entrain-studio"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </section>

      <div className="landing-demo" aria-hidden="true">
        <div className="slots">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="landing-sweep" />
        <span className="landing-demo-caption mono">
          one beat = one jump · 8 Hz shown
        </span>
      </div>

      <section className="grid">
        <div className="card">
          <h3>Lock your gaze</h3>
          <p className="small">
            The stage divides a one-second window into beat-many slots. A line
            steps to the next slot on every beat — discrete fixation events
            your eyes can track, where smooth motion and pulsing dots fail
            above a few hertz. Its phase is the exact integral of the beat
            glide, so what you see is ground truth for what you hear.
          </p>
        </div>
        <div className="card">
          <h3>One glide, start to end</h3>
          <p className="small">
            No keyframe forests. Every layer has Start and End values —
            carrier, beat, gain — and interpolates linearly across the whole
            soundtrack. Tie them for a steady tone, untie them for a descent
            arc. Imports and exports SBaGen scripts.
          </p>
        </div>
        <div className="card">
          <h3>Local-first</h3>
          <p className="small">
            Everything runs in your browser: synthesis, WAV rendering, and
            sharing. The private share URL carries the whole session after the{" "}
            <span className="mono">#</span>, so it never reaches a server. No
            account, no wallet, autosaved locally.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <span className="mono">ENTRAIN · local-first · open source</span>
        <span>
          <a href="/studio">Studio</a>
          {" · "}
          <a
            href="https://github.com/7flash/entrain-studio"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/7flash/entrain-studio
          </a>
        </span>
      </footer>
    </main>
  );
}
