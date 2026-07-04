import { authFromRequest } from "@/lib/access-policy";
import { json, readJson } from "@/lib/http";
import {
  createWithdrawal,
  getRewardBalance,
  rewardConfig,
} from "@/lib/rewards";

export async function POST(req: Request) {
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Connect Phantom to request a withdrawal.",
        requiresWallet: true,
      },
      { status: 401 },
    );
  const body = await readJson<{ amount?: number; destinationWallet?: string }>(
    req,
  );
  try {
    const withdrawal = createWithdrawal(
      auth.publicKey,
      Number(body?.amount || 0),
      body?.destinationWallet || auth.publicKey,
    );
    return json({
      ok: true,
      withdrawal,
      balance: getRewardBalance(auth.publicKey),
      config: rewardConfig(),
    });
  } catch (e: any) {
    return json(
      { ok: false, error: e.message || "withdrawal request failed" },
      { status: 400 },
    );
  }
}
