# Reddit Client for Even Realities G2

A fast, modular Reddit client optimized for Even Realities G2 smart glasses.

## 🚀 Quick Start (Auth)

1.  **Get Credentials**:
    - Log in to [reddit.com](https://www.reddit.com).
    - Open DevTools (F12) → **Application** → **Cookies**.
    - Copy the values for `token_v2` and `reddit_session`.
2.  **Configure**:
    - Open the [Debug Panel](https://plungarini.github.io/reddit-feed-even/) (or local dev).
    - Enter your credentials in the auth section and save.
3.  **Run on G2**:
    - Open the Even app and add the app URL: `https://plungarini.github.io/reddit-feed-even/`.

## 🎮 Controls

| Gesture            | Action                    |
| ------------------ | ------------------------- |
| Swipe Forward/Down | Next post / Scroll down   |
| Swipe Backward/Up  | Previous post / Scroll up |
| Single Tap         | Open post / View comments |
| Double Tap         | Go back / Open menu       |

## 🛠️ Development

```bash
npm install     # Install dependencies
npm run dev     # Start local server (port 5173)
npm run build   # Production build (dist/)
npm run qr      # Generate G2 connection QR code
```

---

MIT License | Built for [Even Realities G2](https://www.evenrealities.com)
