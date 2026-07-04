import { authFromRequest } from "@/lib/access-policy";
import { json } from "@/lib/http";
import { getRewardBalance, rewardConfig, rewardHistory } from "@/lib/rewards";

export function GET(req: Request) {
  const auth = authFromRequest(req);
  if (!auth)
    return json(
      {
        ok: false,
        error: "Connect Phantom to view your personal account balance.",
        requiresWallet: true,
      },
      { status: 401 },
    );
  const balance = getRewardBalance(auth.publicKey);
  const history = rewardHistory(auth.publicKey, 80);
  return json({
    ok: true,
    publicKey: auth.publicKey,
    balance,
    config: rewardConfig(),
    ...history,
  });
}
