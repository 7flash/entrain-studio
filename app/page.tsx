const GITHUB = "https://github.com/7flash/entrain-studio";

// 8 Hann-like humps across a 800×150 viewBox, baseline y=120 — matches the
// studio stage's iso-smooth scenery.
const HUMPS = [0, 100, 200, 300, 400, 500, 600, 700]
  .map(
    (x) =>
      `M${x},120 C${x + 18},120 ${x + 32},30 ${x + 50},30 C${x + 68},30 ${x + 82},120 ${x + 100},120`,
  )
  .join(" ");

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="wrap">
        <nav className="landing-nav reveal">
          <span className="brand">
            EN<b>TRAIN</b>
          </span>
          <div className="navlinks">
            <a
              className="ghost-a mono"
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
            >
              github ↗
            </a>
            <a className="btn primary" href="/studio">
              Open Studio
            </a>
          </div>
        </nav>

        <section className="landing-hero">
          <div className="kicker reveal r1">
            neuroacoustic entrainment · in the browser
          </div>
          <h1 className="reveal r2">
            A beat your ears follow.
            <br />A line your eyes <em>lock onto.</em>
          </h1>
          <p className="lede reveal r3">
            ENTRAIN Studio composes binaural, monaural, and isochronic
            soundtracks — and pairs them with a fixation target that jumps once
            per beat, phase-locked to the exact glide the audio plays.
          </p>
          <div className="btnrow landing-cta reveal r4">
            <a className="btn primary big" href="/studio">
              Open Studio — it's free
            </a>
            <a
              className="btn big"
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source on GitHub
            </a>
          </div>
          <div className="spectrum-rule reveal r4" aria-hidden="true" />
        </section>

        <section className="landing-demo reveal r5" aria-hidden="true">
          <span className="readout l mono">00:04 / 20:00</span>
          <span className="readout r mono">
            alpha · beat 8.00 Hz · carrier 220 Hz
          </span>
          <span className="readout b mono">1 layer · speakers ok</span>
          <span className="readout br mono">running</span>
          <svg
            className="demo-humps"
            viewBox="0 0 800 150"
            preserveAspectRatio="none"
          >
            <path className="hump-fill" d={`${HUMPS} L800,120 L0,120 Z`} />
            <path className="hump-line" d={HUMPS} fill="none" />
            <line className="demo-baseline" x1="0" y1="120" x2="800" y2="120" />
            {[50, 150, 250, 350, 450, 550, 650, 750].map((x) => (
              <circle className="demo-dot" cx={x} cy="120" r="2.5" key={x} />
            ))}
          </svg>
          <span className="landing-sweep" />
          <span className="landing-demo-caption mono">
            one beat = one jump · 8 Hz shown · position = ⌊∫ beat dt⌋ mod slots
          </span>
        </section>

        <section className="landing-principles">
          <article className="principle reveal r5">
            <span className="p-index mono">01 · fixation</span>
            <h3>A target the eye can actually track</h3>
            <p>
              Smooth motion and pulsing dots stop reading above a few hertz. A
              line that <em>jumps</em> to a new slot every beat produces
              discrete fixation events — trackable at 30&nbsp;Hz on an ordinary
              display. Its position comes from the exact phase integral of the
              beat glide, so the visual is ground truth for the audio.
            </p>
          </article>
          <article className="principle reveal r6">
            <span className="p-index mono">02 · one glide</span>
            <h3>Start → End. Nothing else.</h3>
            <p>
              No keyframe forests. Every layer holds two states — Start and End
              — for carrier, beat, and gain, interpolated linearly across the
              whole soundtrack. Tie them for a steady tone; untie for a descent
              arc. SBaGen scripts import and export cleanly.
            </p>
          </article>
          <article className="principle reveal r7">
            <span className="p-index mono">03 · local-first</span>
            <h3>Your session never leaves the tab</h3>
            <p>
              Synthesis, WAV rendering, autosave, sharing, and widget embeds all
              run in the browser. The share URL carries the entire session after
              the <span className="mono">#</span> — a fragment the server never
              receives. No account. No wallet.
            </p>
          </article>
        </section>

        <section className="landing-bands reveal r7">
          <div className="bands-head">
            <span className="kicker">the spectrum</span>
            <p className="small">
              Beat rate targets a band; carrier and texture set the feel.
            </p>
          </div>
          <div className="band-chips mono">
            <span className="band-chip" style={{ color: "#6b7cf0" }}>
              ● delta &lt;4 Hz
            </span>
            <span className="band-chip" style={{ color: "#5aa9e6" }}>
              ● theta 4–8 Hz
            </span>
            <span className="band-chip" style={{ color: "#54dccf" }}>
              ● alpha 8–12 Hz
            </span>
            <span className="band-chip" style={{ color: "#e6a94a" }}>
              ● beta 12–30 Hz
            </span>
            <span className="band-chip" style={{ color: "#e2726a" }}>
              ● gamma 30+ Hz
            </span>
          </div>
          <div className="type-strip mono">
            plain carrier · isochronic trap / smooth / hard · monaural ·
            binaural · noise bed · procedural ambience · ambience file ·
            additive drone · karplus pluck
          </div>
        </section>

        <section className="landing-flow">
          <div className="flow-step reveal r5">
            <span className="flow-num">1</span>
            <h4>Add a carrier</h4>
            <p className="small">
              One steady tone. Verify it sounds clean on the device you will
              actually use.
            </p>
          </div>
          <div className="flow-step reveal r6">
            <span className="flow-num">2</span>
            <h4>Choose a modulation</h4>
            <p className="small">
              Switch the layer's type — isochronic for speakers, binaural for
              headphones.
            </p>
          </div>
          <div className="flow-step reveal r7">
            <span className="flow-num">3</span>
            <h4>Set Start → End</h4>
            <p className="small">
              Two sliders per parameter. Untie them and the whole track becomes
              one linear glide.
            </p>
          </div>
          <div className="flow-step reveal r8">
            <span className="flow-num">4</span>
            <h4>Press Start. Lock on.</h4>
            <p className="small">
              Follow the jumping line while the beat runs. Export WAV, SBaGen, a
              private Studio URL, or an embeddable Widget URL.
            </p>
          </div>
        </section>

        <section className="landing-final reveal r8">
          <h2>
            Twenty minutes, one glide,
            <br />
            <em>eyes on the line.</em>
          </h2>
          <div className="btnrow landing-cta">
            <a className="btn primary big" href="/studio">
              Open Studio
            </a>
          </div>
        </section>

        <footer className="landing-footer">
          <span className="mono">ENTRAIN · local-first · open source</span>
          <span>
            <a href="/studio">Studio</a>
            {" · "}
            <a href={GITHUB} target="_blank" rel="noopener noreferrer">
              github.com/7flash/entrain-studio
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
