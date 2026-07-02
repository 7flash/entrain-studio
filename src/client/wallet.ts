type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
};

declare global { interface Window { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider } }

export type WalletState = { authenticated: boolean; publicKey: string | null; balance: number; expiresAt?: number | null };

export async function getWalletState(): Promise<WalletState> {
  const r = await fetch('/api/auth/session').then((x) => x.json()).catch(() => ({ authenticated: false }));
  return { authenticated: !!r.authenticated, publicKey: r.publicKey || null, balance: Number(r.balance || 0), expiresAt: r.expiresAt || null };
}

export async function refreshWalletBalance() {
  const r = await fetch('/api/auth/refresh', { method:'POST' }).then((x) => x.json());
  if (!r.ok) throw new Error(r.error || 'refresh failed');
  return { authenticated: true, publicKey: r.publicKey || null, balance: Number(r.balance || 0), expiresAt: r.expiresAt || null } as WalletState;
}

export async function connectAndVerify() {
  const provider = window.phantom?.solana || window.solana;
  if (!provider?.isPhantom) {
    window.open('https://phantom.app/', '_blank');
    throw new Error('Phantom not installed');
  }
  const conn = await provider.connect();
  const publicKey = conn.publicKey.toString();
  const challenge = await fetch('/api/auth/challenge', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ publicKey }) }).then((r)=>r.json());
  if (!challenge.ok) throw new Error(challenge.error || 'challenge failed');
  const encoded = new TextEncoder().encode(challenge.message);
  const signed = await provider.signMessage(encoded, 'utf8');
  const signature = base58Encode(signed.signature);
  const verified = await fetch('/api/auth/verify', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ publicKey, nonce: challenge.nonce, signature }) }).then((r)=>r.json());
  if (!verified.ok) throw new Error(verified.error || 'verify failed');
  return { authenticated: true, publicKey, balance: Number(verified.balance || 0), expiresAt: verified.expiresAt || null } as WalletState;
}

export function tierLabel(minTokens: number) {
  if (minTokens >= 100) return 'collector';
  if (minTokens >= 10) return 'pro';
  if (minTokens >= 1) return 'holder';
  return 'free';
}

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes: Uint8Array) {
  let digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) digits.push(0);
  return digits.reverse().map((d) => alphabet[d]).join('');
}
