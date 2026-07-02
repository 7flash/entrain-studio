import { render, navigate } from 'tradjs/client';
import { connectAndVerify, getWalletState, refreshWalletBalance } from '@/client/wallet';

let message = '';

function Status() {
  return <p className="small">{message}</p>;
}
function paint() {
  const root = document.getElementById('detail-auth-root');
  if (root) render(<Status />, root);
}

export default function mount() {
  const btn = document.getElementById('launch-template') as HTMLButtonElement | null;
  async function launch() {
    const slug = btn?.dataset.slug;
    if (!slug) return;
    btn.disabled = true;
    message = 'checking access…'; paint();
    let res = await fetch(`/api/access?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
    if (!res.ok && res.requiresWallet) {
      message = 'connect and sign to unlock this template…'; paint();
      await connectAndVerify();
      res = await fetch(`/api/access?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
    }
    if (!res.ok && res.staleBalance) {
      message = 'refreshing balance…'; paint();
      await refreshWalletBalance();
      res = await fetch(`/api/access?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
    }
    btn.disabled = false;
    if (!res.ok) { message = res.error || 'locked'; paint(); return; }
    sessionStorage.setItem('entrain:loaded-session', JSON.stringify(res.template.session));
    navigate(`/studio?template=${encodeURIComponent(slug)}`);
  }
  btn?.addEventListener('click', launch);
  getWalletState().then((s) => { message = s.authenticated ? `${s.balance} $ENTRAIN verified` : ''; paint(); });
  return () => btn?.removeEventListener('click', launch);
}
