const WIDGET_CSS = `
.widget-page{min-height:100vh;margin:0 -22px;padding:0;background:radial-gradient(780px 420px at 80% -20%,#1b314b 0%,transparent 58%),#0b1019;color:var(--text)}
.widget-root{min-height:100vh;display:flex;align-items:stretch;justify-content:center;padding:10px}
.widget-card{width:100%;max-width:820px;min-height:260px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(23,34,56,.96),rgba(17,26,40,.98));border-radius:18px;overflow:hidden;box-shadow:0 18px 80px -52px #000}
.widget-stage{position:relative;height:220px;background:radial-gradient(500px 220px at 50% 0%,rgba(84,220,207,.12),transparent 70%),#0d1420;border-bottom:1px solid var(--line)}
.widget-stage canvas{display:block;width:100%;height:100%}
.widget-readout{position:absolute;padding:5px 8px;border:1px solid rgba(64,85,121,.76);background:rgba(11,16,25,.74);border-radius:999px;font-size:11px;color:var(--muted);backdrop-filter:blur(6px)}
.widget-readout.l{top:10px;left:10px}.widget-readout.r{top:10px;right:10px}.widget-readout.b{bottom:10px;left:10px}.widget-readout.br{bottom:10px;right:10px}
.widget-body{padding:14px}.widget-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.widget-head h1{font:400 clamp(24px,6vw,38px)/.98 Georgia,serif;margin:0;letter-spacing:-.03em}.widget-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.widget-btn{appearance:none;border:1px solid var(--line2);background:var(--panel);color:var(--text);border-radius:999px;padding:9px 13px;font-weight:650;cursor:pointer}.widget-btn.primary{background:var(--trace);border-color:var(--trace);color:#041f1c}.widget-btn:hover{border-color:var(--trace)}.widget-meta{display:flex;gap:8px;flex-wrap:wrap}.widget-error{padding:20px}.widget-open{font-size:12px;color:var(--trace)}
@media (max-width:520px){.widget-page{margin:0 -14px}.widget-root{padding:0}.widget-card{border-radius:0;min-height:100vh}.widget-stage{height:190px}.widget-head{display:block}.widget-controls{margin-top:12px}.widget-readout.r{top:44px;left:10px;right:auto}.widget-readout.br{display:none}}
`;

export default function WidgetPage() {
  return (
    <main className="widget-page">
      <style>{WIDGET_CSS}</style>
      <section className="widget-root" id="widget-root">
        <div className="widget-card">
          <div className="widget-error">
            <p className="muted">Loading embeddable ENTRAIN widget…</p>
          </div>
        </div>
      </section>
    </main>
  );
}
