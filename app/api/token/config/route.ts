import { json } from "@/lib/http";
export function GET() {
  return json({
    ok: true,
    payments: false,
    phantom: false,
    message:
      "Token gates are disabled. ENTRAIN uses Google accounts for private saves and optional public publishing.",
  });
}
