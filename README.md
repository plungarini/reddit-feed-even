# Reddit Feed

> Reddit. Now literally in front of you.

A full-featured Reddit client for the [Even Realities Glasses](https://www.evenrealities.com) smart glasses. Browse your favourite feeds, read posts and comments, and switch endpoints — all hands-free on a heads-up display.

## What it does

Reddit Feed brings the front page of the internet to your G2 glasses. It fetches live Reddit posts through a lightweight Cloudflare Worker proxy, renders them in crisp 4-bit greyscale containers, and lets you navigate entirely with the glasses' touch gestures. A companion mobile UI (React) runs in the WebView for settings, auth configuration, and a rich post preview.

## Key Features

- **Multiple Feeds** – Hot, New, Rising, Top, Controversial, Popular, All, and Best (personalized with auth)
- **Paginated Browsing** – 4 posts per page; smooth highlight navigation with automatic prefetching
- **Post Detail View** – Read full titles, self-text, and live link previews fetched in the background
- **Comments** – Top-level comment threads with pagination and score-sorted ordering
- **Authenticated or Anonymous** – Optional cookie-based auth (`token_v2` + `reddit_session`) for subscribed feeds
- **Smart Rate-Limiting** – Retry countdowns and request throttling to stay within Reddit API limits
- **In-Memory Caching** – Configurable TTL cache for posts and link previews to reduce API churn
- **Double-Scroll Gestures** – Scroll twice within 2 s at page boundaries to advance/load more content
- **Companion Mobile UI** – React + Tailwind settings panel for auth, feed preferences, proxy URL, and debug logs

## How it works / User flow

1. **Launch** → The app shows a loading animation while it fetches the default feed.
2. **Feed** → Scroll down/up to highlight one of four posts. Double-scroll at the bottom to load the next page.
3. **Detail** → Single-tap a highlighted post to open its full text and link preview. Scroll to read long content.
4. **Comments** → Single-tap again in detail to load top comments. Double-scroll paginates through comment pages.
5. **Menu** → Double-tap in the feed to open the endpoint menu, scroll to highlight, and tap to switch feeds.
6. **Back** → Double-tap anywhere to go back to the previous screen.

## Tech Stack

| Layer           | Technology                                             |
| --------------- | ------------------------------------------------------ |
| Glasses runtime | TypeScript + Even Hub SDK `^0.0.9`                     |
| Build tool      | Vite `^8.0.3`                                          |
| Companion UI    | React `^19.2.4`, Tailwind CSS `^4.2.2`, `even-toolkit` |
| Backend proxy   | Hono + Cloudflare Workers (`wrangler`)                 |
| Packaging       | `evenhub-cli` `^0.1.11`                                |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server + QR code + local proxy
npm run dev

# Test in the browser simulator
npm run emulator

# Build for production
npm run build

# Package as .ehpk for distribution
npm run pack
```

### Auth setup (optional)

1. Log in to [reddit.com](https://www.reddit.com) in a browser.
2. Open DevTools → **Application** → **Cookies**.
3. Copy `token_v2` and `reddit_session`.
4. Open the app's **Settings** tab in the WebView and paste the values.

## Why it exists

Smart glasses are perfect for glanceable, hands-free content consumption. Reddit Feed lets you stay up to date with news, discussions, and memes while commuting, walking, or doing anything else — no phone required. It turns the G2 into a wearable Reddit reader with a UI crafted specifically for the 576 × 288 pixel, 4-bit greyscale display.

---

MIT License | Built by [Pietro Lungarini](https://github.com/plungarini) for the Even Realities Glasses
