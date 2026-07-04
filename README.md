# ENTRAIN TradJS Server v0.40

This build polishes the Google-account publishing model while keeping Studio local-first.

- Studio still works without login for creating, playing, rendering, importing/exporting, and exact private `#` source URL sharing.
- Google login is only for persistent account features:
  - unlimited private library saves,
  - `/shared/<id>` links,
  - publishing selected user tracks into the public catalogue.
- Public Explore catalogue remains ordered as prepared rows first, then user-published rows.
- Creator workspace now lists your public catalogue rows and lets you unpublish them.
- Studio now has a visible **Publish to catalogue** action.
- Explore now has client-side search/filtering across titles, descriptions, tags, creators, and bands.
- Payments, Phantom, token gates, room rewards, and withdrawals remain disabled.

## Setup

```bash
bun install
cp .env.example .env
```

Configure Google OAuth in `.env`:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
MAX_SAVED_TRACKS_PER_USER=0 # 0 = unlimited private library saves
MAX_PUBLIC_TRACKS_PER_USER=50
```

Then run:

```bash
bun run sync:soundtracks
bun run dev
```
