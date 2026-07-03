import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-auth";
import { json } from "@/lib/http";
import { buildAuditReport } from "@/lib/audit-report";

export function GET(req: Request) {
  if (!isAdminRequest(req))
    return json({ ok: false, error: "admin token required" }, { status: 401 });
  const url = new URL(req.url);
  const includeSignals = url.searchParams.get("signals") === "1";
  const rows = db.templates.select().orderBy("sortOrder", "ASC").all() as any[];
  return json({ ok: true, report: buildAuditReport(rows, { includeSignals }) });
}
