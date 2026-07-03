import { SOLANA_RPC, TOKEN_MINT } from "./config";
import { rpcMeasure } from "./measure";

type RpcTokenAccount = {
  account: {
    data: {
      parsed: {
        info: {
          mint?: string;
          tokenAmount: { uiAmount: number | null; uiAmountString?: string };
        };
      };
    };
  };
};

export async function getTokenBalance(publicKey: string, mint = TOKEN_MINT) {
  return await rpcMeasure.measure.assert(
    {
      label: "Solana token balance",
      publicKey: publicKey.slice(0, 4),
      budget: 1200,
      timeout: 8000,
    },
    async () => {
      const res = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [publicKey, { mint }, { encoding: "jsonParsed" }],
        }),
      });
      const payload = await res.json();
      if (payload.error)
        throw new Error(payload.error.message || "Solana RPC error");
      let total = 0;
      for (const account of (payload.result?.value ||
        []) as RpcTokenAccount[]) {
        const info = account.account.data.parsed.info;
        if (info.mint && info.mint !== mint) continue;
        const amt = info.tokenAmount;
        total += amt.uiAmount ?? Number(amt.uiAmountString || 0);
      }
      return total;
    },
  );
}
