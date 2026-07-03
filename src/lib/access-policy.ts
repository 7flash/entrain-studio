import type { EntrainTemplateV1 } from "@/format/entrain-format";
import { getAuthSession } from "./auth";
import { cookieValue, json } from "./http";
import { tokenAmountLabel } from "./config";

export type WalletAuth = ReturnType<typeof getAuthSession>;
export type SoundtrackAction = "view" | "play" | "export" | "clone";
export type LibraryAction = "list" | "save" | "update" | "delete";

export type AccessDecision = {
  ok: boolean;
  code: "ok" | "wallet_required" | "insufficient_balance" | "not_found";
  message: string;
  minTokens: number;
  balance: number;
  requiresWallet: boolean;
  staleBalance: boolean;
  balanceRefreshedAt?: number; // cached wallet balance timestamp; access is not a live on-chain check.
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
  if (minTokens <= 0)
    return {
      ok: true,
      code: "ok",
      message: "Unlocked",
      minTokens,
      balance,
      requiresWallet: false,
      staleBalance: false,
      balanceRefreshedAt: auth?.lastRefreshedAt,
    };
  if (!auth)
    return {
      ok: false,
      code: "wallet_required",
      message: `Connect Phantom to ${verb(action)} this soundtrack. Requires ${tokenAmountLabel(minTokens)}.`,
      minTokens,
      balance,
      requiresWallet: true,
      staleBalance: false,
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
    };
  return {
    ok: true,
    code: "ok",
    message: "Unlocked using cached wallet balance from last verification.",
    minTokens,
    balance,
    requiresWallet: false,
    staleBalance: false,
    balanceRefreshedAt: auth.lastRefreshedAt,
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
  const status = decision.code === "not_found" ? 404 : decision.ok ? 200 : 403;
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
  return "play";
}
