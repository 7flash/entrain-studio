import { render } from 'tradjs/client';
import { connectAndVerify, getWalletState, refreshWalletBalance, type WalletState } from '@/client/wallet';

let state: WalletState = { authenticated: false, balance: 0, publicKey: null };
let message = '';

function AuthBox() {
  return (
    <div className="card">
      <div className="toolbar">
        <div>
          <strong>Wallet access</strong>
          <div className="small">{state.authenticated ? `${state.publicKey?.slice(0,4)}…${state.publicKey?.slice(-4)} · ${state.balance} $ENTRAIN` : 'Connect Phantom to unlock gated soundtracks.'}</div>
          {message ? <div className="small">{message}</div> : null}
        </div>
        <div className="tagrow">
          <button className="btn primary" onClick={async () => run(connectAndVerify)}>Connect Phantom</button>
          <button className="btn" onClick={async () => run(refreshWalletBalance)}>Refresh balance</button>
        </div>
      </div>
    </div>
  );
}

async function run(fn: () => Promise<WalletState>) {
  message = 'checking wallet…'; paint();
  try { state = await fn(); message = 'wallet verified'; }
  catch (e: any) { message = e.message || 'wallet check failed'; }
  paint();
}

function markCards() {
  document.querySelectorAll<HTMLElement>('[data-soundtrack-card]').forEach((el) => {
    const need = Number(el.dataset.minTokens || '0');
    const label = el.querySelector('.gate') as HTMLElement | null;
    const ok = need <= 0 || state.balance >= need;
    el.classList.toggle('locked-card', !ok && need > 0);
    el.classList.toggle('unlocked-card', ok && need > 0);
    if (label) {
      label.classList.toggle('locked', !ok);
      label.classList.toggle('unlocked', ok);
      label.textContent = ok ? `unlocked · ${need} $ENTRAIN` : `locked · ${need} $ENTRAIN`;
    }
  });
}

function paint() {
  const root = document.getElementById('auth-root');
  if (root) render(<AuthBox />, root);
  markCards();
}

export default function mount() {
  getWalletState().then((s) => { state = s; paint(); });
  return () => {
    const root = document.getElementById('auth-root');
    if (root) render(null, root);
  };
}
