import type { EntrainTemplateV1 } from "@/format/entrain-format";
import { getAuthSession } from "./auth";
import { cookieValue, json } from "./http";
import { tokenAmountLabel } from "./config";
import { formatSol, hasPurchase } from "./marketplace";

export type WalletAuth = ReturnType<typeof getAuthSession>;
export type SoundtrackAction =
  "view" | "play" | "export" | "clone" | "room" | "buy";
export type LibraryAction = "list" | "save" | "update" | "delete";

export type AccessDecision = {
  ok: boolean;
  code:
    | "ok"
    | "wallet_required"
    | "insufficient_balance"
    | "payment_required"
    | "not_found";
  message: string;
  minTokens: number;
  balance: number;
  requiresWallet: boolean;
  staleBalance: boolean;
  balanceRefreshedAt?: number;
  priceLamports?: number;
  priceCurrency?: "SOL";
  payoutWallet?: string;
  ownedByUser?: boolean;
  purchased?: boolean;
};

export function authFromRequest(req: Request) {
  return getAuthSession(cookieValue(req));
}

export function decideSoundtrackAccess(
  template: EntrainTemplateV1 | null,
  auth: WalletAuth,
  action: SoundtrackAction = "play",
): AccessDecision {
  if (!template)
    return {
      ok: false,
      code: "not_found",
      message: "Soundtrack not found",
      minTokens: 0,
      balance: 0,
      requiresWallet: false,
      staleBalance: false,
      balanceRefreshedAt: auth?.lastRefreshedAt,
    };
  const minTokens = Number(template.minTokens || 0);
  const balance = Number(auth?.balance || 0);
  const priceLamports = Number(template.market?.priceLamports || 0);
  const payoutWallet = template.market?.payoutWallet || template.creatorWallet;
  const ownedByUser =
    !!auth?.publicKey &&
    !!template.ownerPublicKey &&
    auth.publicKey === template.ownerPublicKey;
  const purchased =
    !!auth?.publicKey && hasPurchase(auth.publicKey, template.slug);

  if (ownedByUser)
    return {
      ok: true,
      code: "ok",
      message: "Creator owner access.",
      minTokens,
      balance,
      requiresWallet: false,
      staleBalance: false,
      balanceRefreshedAt: auth?.lastRefreshedAt,
      priceLamports,
      priceCurrency: "SOL",
      payoutWallet,
      ownedByUser,
      purchased,
    };

  if (minTokens > 0) {
    if (!auth)
      return {
        ok: false,
        code: "wallet_required",
        message: `Connect Phantom to ${verb(action)} this soundtrack. Requires ${tokenAmountLabel(minTokens)}.`,
        minTokens,
        balance,
        requiresWallet: true,
        staleBalance: false,
        priceLamports,
        priceCurrency: "SOL",
        payoutWallet,
      };
    const maxAgeMs = minTokens >= 10 ? 5 * 60_000 : 60 * 60_000;
    if (!auth.lastRefreshedAt || Date.now() - auth.lastRefreshedAt > maxAgeMs)
      return {
        ok: false,
        code: "insufficient_balance",
        message: `Refresh Phantom balance to ${verb(action)} this ${tokenAmountLabel(minTokens)} tier soundtrack.`,
        minTokens,
        balance,
        requiresWallet: false,
        staleBalance: true,
        balanceRefreshedAt: auth.lastRefreshedAt,
        priceLamports,
        priceCurrency: "SOL",
        payoutWallet,
      };
    if (balance < minTokens)
      return {
        ok: false,
        code: "insufficient_balance",
        message: `Requires ${tokenAmountLabel(minTokens)}. Current verified balance: ${tokenAmountLabel(balance)}.`,
        minTokens,
        balance,
        requiresWallet: false,
        staleBalance: true,
        balanceRefreshedAt: auth.lastRefreshedAt,
        priceLamports,
        priceCurrency: "SOL",
        payoutWallet,
      };
  }

  if (priceLamports > 0 && !purchased) {
    if (!auth)
      return {
        ok: false,
        code: "wallet_required",
        message: `Connect Phantom to buy this creator soundtrack for ${formatSol(priceLamports)}.`,
        minTokens,
        balance,
        requiresWallet: true,
        staleBalance: false,
        priceLamports,
        priceCurrency: "SOL",
        payoutWallet,
      };
    return {
      ok: false,
      code: "payment_required",
      message: `Purchase required: ${formatSol(priceLamports)} paid directly to the creator wallet.`,
      minTokens,
      balance,
      requiresWallet: false,
      staleBalance: false,
      balanceRefreshedAt: auth.lastRefreshedAt,
      priceLamports,
      priceCurrency: "SOL",
      payoutWallet,
      purchased: false,
    };
  }

  const reason =
    priceLamports > 0
      ? "Unlocked by purchase."
      : minTokens > 0
        ? "Unlocked using cached wallet balance from last verification."
        : "Unlocked";
  return {
    ok: true,
    code: "ok",
    message: reason,
    minTokens,
    balance,
    requiresWallet: false,
    staleBalance: false,
    balanceRefreshedAt: auth?.lastRefreshedAt,
    priceLamports,
    priceCurrency: "SOL",
    payoutWallet,
    ownedByUser,
    purchased,
  };
}

export type LibraryAccessDecision = {
  ok: boolean;
  code: "ok" | "wallet_required";
  message: string;
  balance?: number;
  balanceRefreshedAt?: number;
};

export function decideLibraryAccess(
  auth: WalletAuth,
  action: LibraryAction = "save",
): LibraryAccessDecision {
  if (!auth)
    return {
      ok: false,
      code: "wallet_required",
      message: `Connect Phantom to ${action} tracks in your private library.`,
    };
  return {
    ok: true,
    code: "ok",
    message: "Wallet library unlocked",
    balance: auth.balance,
    balanceRefreshedAt: auth.lastRefreshedAt,
  };
}

export function accessJson(
  decision: AccessDecision,
  extra: Record<string, unknown> = {},
) {
  const status =
    decision.code === "not_found"
      ? 404
      : decision.ok
        ? 200
        : decision.code === "payment_required"
          ? 402
          : 403;
  return json(
    {
      ...decision,
      ok: decision.ok,
      error: decision.ok ? undefined : decision.message,
      ...extra,
    },
    { status },
  );
}

function verb(action: SoundtrackAction) {
  if (action === "export") return "export";
  if (action === "clone") return "clone";
  if (action === "view") return "view";
  if (action === "room") return "start a synced room for";
  if (action === "buy") return "buy";
  return "play";
}
