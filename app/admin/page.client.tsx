import { render } from "tradjs/client";
import { defaultSession, sanitizeSession } from "@/format/entrain-format";
import {
  analyzeSession,
  analysisBadge,
  claimRisk,
} from "@/format/protocol-analyzer";
import {
  compareToReference,
  protocolReferences,
} from "@/format/protocol-reference";
import { signalMapForSession, formatSignalPoint } from "@/format/channel-map";
import { sbagenTextToSession, sessionToSbagenText } from "@/format/sbagen";

let adminToken = localStorage.getItem("entrain:admin-token") || "";
let rows: any[] = [];
let selected: any = freshRow();
let message = "";
let busy = false;

function freshRow() {
  const session = defaultSession();
  return {
    slug: "new-soundtrack",
    title: session.name,
    summary: "",
    description: "",
    category: "custom",
    tags: "custom",
    minTokens: 0,
    unlockNote: "",
    sortOrder: 100,
    isPublished: true,
    status: "published",
    copyReviewed: false,
    sessionText: JSON.stringify(session, null, 2),
    lineageText: JSON.stringify(
      {
        referenceId: "",
        accuracy: "inspired",
        sourceLabel: "",
        disclosure: "",
        intentionalDifferences: [],
      },
      null,
      2,
    ),
  };
}

function App() {
  const parsed = parseSelectedSession();
  const analysis = parsed ? analyzeSession(parsed) : null;
  const claim = claimRisk(
    `${selected.title} ${selected.summary} ${selected.description} ${selected.unlockNote}`,
    { reviewed: !!selected.copyReviewed },
  );
  const lineage = parseLineage();
  const refMatch =
    parsed && lineage?.referenceId
      ? compareToReference(parsed, lineage.referenceId)
      : null;
  const signalMap = parsed ? signalMapForSession(parsed) : null;
  return (
    <div className="panel">
      <div className="toolbar">
        <div>
          <strong>Prepared soundtrack rows</strong>
          <div className="small">{message || `${rows.length} rows loaded`}</div>
        </div>
        <div className="tagrow">
          <input
            style={{ width: "220px" }}
            type="password"
            placeholder="ADMIN_TOKEN"
            value={adminToken}
            onInput={(e: any) => {
              adminToken = e.currentTarget.value;
              localStorage.setItem("entrain:admin-token", adminToken);
            }}
          />
          <button className="btn primary" disabled={busy} onClick={loadRows}>
            Load
          </button>
          <button
            className="btn"
            onClick={() => {
              selected = freshRow();
              paint();
            }}
          >
            New
          </button>
        </div>
      </div>

      <div className="studio-grid">
        <aside>
          <div className="list">
            {rows.map((r) => (
              <button
                className="preset btn"
                style={{ textAlign: "left", display: "block" }}
                key={r.slug}
                onClick={() => editRow(r)}
              >
                <strong>{r.title}</strong>
                <br />
                <span className="small">
                  /{r.slug} · {r.minTokens ? `${r.minTokens} tokens` : "free"} ·{" "}
                  {r.status || (r.isPublished ? "published" : "draft")}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section>
          <div className="two">
            <Field label="Slug">
              <input
                value={selected.slug}
                onInput={(e: any) => {
                  selected.slug = e.currentTarget.value;
                  paint();
                }}
              />
            </Field>
            <Field label="Title">
              <input
                value={selected.title}
                onInput={(e: any) => {
                  selected.title = e.currentTarget.value;
                  paint();
                }}
              />
            </Field>
            <Field label="Category">
              <input
                value={selected.category}
                onInput={(e: any) => {
                  selected.category = e.currentTarget.value;
                  paint();
                }}
              />
            </Field>
            <Field label="Minimum token balance">
              <input
                type="number"
                min="0"
                value={String(selected.minTokens)}
                onInput={(e: any) => {
                  selected.minTokens = Number(e.currentTarget.value || 0);
                  paint();
                }}
              />
            </Field>
            <Field label="Tags, comma separated">
              <input
                value={selected.tags}
                onInput={(e: any) => {
                  selected.tags = e.currentTarget.value;
                  paint();
                }}
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                value={String(selected.sortOrder)}
                onInput={(e: any) => {
                  selected.sortOrder = Number(e.currentTarget.value || 0);
                  paint();
                }}
              />
            </Field>
            <Field label="Status">
              <select
                value={
                  selected.status ||
                  (selected.isPublished ? "published" : "draft")
                }
                onChange={(e: any) => {
                  selected.status = e.currentTarget.value;
                  selected.isPublished = e.currentTarget.value === "published";
                  paint();
                }}
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </Field>
            <Field label="Copy reviewed">
              <label className="pill">
                <input
                  type="checkbox"
                  checked={!!selected.copyReviewed}
                  onChange={(e: any) => {
                    selected.copyReviewed = !!e.currentTarget.checked;
                    paint();
                  }}
                />{" "}
                allow publish after manual claim review
              </label>
            </Field>
            <Field label="Reference spec">
              <select
                value={lineage?.referenceId || ""}
                onChange={(e: any) => setReferenceId(e.currentTarget.value)}
              >
                <option value="">none / inspired</option>
                {Object.values(protocolReferences).map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Summary">
            <textarea
              rows={2}
              value={selected.summary}
              onInput={(e: any) => {
                selected.summary = e.currentTarget.value;
                paint();
              }}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={4}
              value={selected.description}
              onInput={(e: any) => {
                selected.description = e.currentTarget.value;
                paint();
              }}
            />
          </Field>
          <Field label="Unlock note">
            <textarea
              rows={2}
              value={selected.unlockNote}
              onInput={(e: any) => {
                selected.unlockNote = e.currentTarget.value;
                paint();
              }}
            />
          </Field>
          <label className="pill">
            <input
              type="checkbox"
              checked={!!selected.isPublished}
              onChange={(e: any) => {
                selected.isPublished = !!e.currentTarget.checked;
                paint();
              }}
            />{" "}
            published
          </label>
          <div className="notice">
            <strong>
              Publish analyzer:{" "}
              {analysis ? analysisBadge(analysis) : "invalid JSON"}
            </strong>
            <br />
            <span className="small">
              {analysis
                ? `${analysis.headphonesRequired ? "headphones required" : "speaker-safe"} · ${analysis.mixStatus} · peak ${analysis.estimatedPeakDb.toFixed(1)} dBFS · ${analysis.issues.length} issue(s)`
                : "Cannot parse session JSON."}
            </span>
            {analysis?.issues.length ? (
              <ul className="small">
                {analysis.issues.slice(0, 6).map((i) => (
                  <li key={i.code + i.message}>
                    {i.level}: {i.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {claim.risky ? (
              <p className="small warn">
                Claim-risk terms detected. Keep public copy away from medical,
                guaranteed, or supernatural claims.
              </p>
            ) : null}
          </div>
          <div className="notice">
            <strong>
              Reference match:{" "}
              {refMatch
                ? `${refMatch.matches ? "matches" : "differs"} · ${refMatch.score}/100`
                : "none declared"}
            </strong>
            {refMatch?.deviations.length ? (
              <ul className="small">
                {refMatch.deviations.slice(0, 8).map((d) => (
                  <li key={d.code + d.message}>
                    {d.level}: {d.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">
                Use lineage metadata to make intentional differences explicit on
                the public soundtrack page.
              </p>
            )}
          </div>
          {signalMap ? (
            <div className="notice">
              <strong>Computed signal map</strong>
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
                        {l.points.map((p) => formatSignalPoint(p)).join(" → ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Field label="Lineage / accuracy JSON">
            <textarea
              className="mono"
              rows={8}
              value={selected.lineageText || ""}
              onInput={(e: any) => {
                selected.lineageText = e.currentTarget.value;
                paint();
              }}
            />
          </Field>
          <Field label="ENTRAIN session JSON">
            <textarea
              className="mono"
              rows={18}
              value={selected.sessionText}
              onInput={(e: any) => {
                selected.sessionText = e.currentTarget.value;
                paint();
              }}
            />
          </Field>
          <div className="tagrow">
            <label className="btn">
              Import SBaGen script
              <input
                type="file"
                accept=".txt,.sbagen,text/plain"
                style={{ display: "none" }}
                onChange={importSbagenToSelected}
              />
            </label>
            <button className="btn" onClick={copySelectedSbagen}>
              Copy SBaGen from row
            </button>
          </div>
          <div className="tagrow">
            <button className="btn primary" disabled={busy} onClick={saveRow}>
              Save soundtrack row
            </button>
            <button className="btn" disabled={busy} onClick={loadFromEditor}>
              Use current editor session
            </button>
            <button className="btn warn" disabled={busy} onClick={deleteRow}>
              Delete / unpublish
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
function parseLineage() {
  try {
    const x = JSON.parse(selected.lineageText || "{}");
    return x && typeof x === "object" ? x : null;
  } catch {
    return null;
  }
}
function setReferenceId(referenceId: string) {
  const x = parseLineage() || {};
  x.referenceId = referenceId || "";
  if (referenceId && !x.accuracy) x.accuracy = "curated-reconstruction";
  selected.lineageText = JSON.stringify(x, null, 2);
  paint();
}
function parseSelectedSession() {
  try {
    return sanitizeSession(JSON.parse(selected.sessionText));
  } catch {
    return null;
  }
}
function editRow(r: any) {
  selected = {
    ...r,
    copyReviewed: !!r.copyReviewed,
    tags: Array.isArray(r.tags) ? r.tags.join(", ") : r.tags,
    sessionText: JSON.stringify(r.session, null, 2),
    lineageText: JSON.stringify(
      r.lineageJson ||
        r.lineage || {
          referenceId: "",
          accuracy: "inspired",
          sourceLabel: "",
          disclosure: "",
          intentionalDifferences: [],
        },
      null,
      2,
    ),
  };
  paint();
}
async function loadRows() {
  busy = true;
  message = "loading…";
  paint();
  try {
    const res = await fetch("/api/admin/soundtracks", {
      headers: { "x-admin-token": adminToken },
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "load failed");
    rows = res.soundtracks || [];
    message = "loaded";
  } catch (e: any) {
    message = e.message || "load failed";
  }
  busy = false;
  paint();
}
async function importSbagenToSelected(e: any) {
  const f = e.currentTarget.files?.[0];
  if (!f) return;
  try {
    const r = sbagenTextToSession(await f.text(), {
      name: selected.title || selected.slug,
    });
    selected.sessionText = JSON.stringify(r.session, null, 2);
    message = `imported SBaGen script${r.warnings.length ? ` · ${r.warnings.length} note(s)` : ""}`;
  } catch (err: any) {
    message = err.message || "SBaGen import failed";
  }
  e.currentTarget.value = "";
  paint();
}
async function copySelectedSbagen() {
  const parsed = parseSelectedSession();
  if (!parsed) {
    message = "Cannot parse session JSON.";
    paint();
    return;
  }
  await navigator.clipboard
    .writeText(sessionToSbagenText(parsed))
    .catch(() => {});
  message = "SBaGen-compatible script copied";
  paint();
}
function loadFromEditor() {
  const raw =
    sessionStorage.getItem("entrain:admin-draft") ||
    sessionStorage.getItem("entrain:loaded-session");
  if (!raw) {
    message =
      "No session in editor handoff. Open/save something in Studio first.";
    paint();
    return;
  }
  selected.sessionText = JSON.stringify(
    sanitizeSession(JSON.parse(raw)),
    null,
    2,
  );
  message = "copied session from browser handoff";
  paint();
}
async function saveRow() {
  busy = true;
  message = "saving…";
  paint();
  try {
    const session = sanitizeSession(JSON.parse(selected.sessionText));
    const a = analyzeSession(session);
    const lineageJson = parseLineage();
    const refMatch = lineageJson?.referenceId
      ? compareToReference(session, lineageJson.referenceId)
      : null;
    const c = claimRisk(
      `${selected.title} ${selected.summary} ${selected.description} ${selected.unlockNote}`,
      { reviewed: !!selected.copyReviewed },
    );
    const publishing = selected.status === "published" || selected.isPublished;
    if (publishing && (!a.publishable || c.risky)) {
      throw new Error(
        "publish blocked by analyzer; save as draft or fix issues/claims",
      );
    }
    if (publishing && refMatch && !refMatch.matches) {
      throw new Error(
        "publish blocked by declared reference mismatch; fix pattern, choose a different reference, or save as draft",
      );
    }
    const body = {
      ...selected,
      action: "upsert",
      adminToken,
      tags: String(selected.tags || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      session,
      lineageJson,
      analysisJson: a,
      safetyJson: { claimRisk: c, referenceMatch: refMatch },
    };
    delete (body as any).sessionText;
    delete (body as any).lineageText;
    const res = await fetch("/api/admin/soundtracks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "save failed");
    message = "saved";
    await loadRows();
  } catch (e: any) {
    message = e.message || "save failed";
    busy = false;
    paint();
  }
}
async function deleteRow() {
  if (!confirm(`Delete/unpublish ${selected.slug}?`)) return;
  busy = true;
  message = "deleting…";
  paint();
  try {
    const res = await fetch("/api/admin/soundtracks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        adminToken,
        action: "delete",
        slug: selected.slug,
      }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error || "delete failed");
    selected = freshRow();
    message = "deleted";
    await loadRows();
  } catch (e: any) {
    message = e.message || "delete failed";
    busy = false;
    paint();
  }
}
function paint() {
  render(<App />, document.getElementById("admin-root")!);
}
export default function mount() {
  paint();
  loadRows();
  return () => render(null, document.getElementById("admin-root")!);
}
