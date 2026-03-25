# Reddit Client for Even Realities G2

A full-featured Reddit client optimized for Even Realities G2 smart glasses. Browse feeds, read comments, and interact with posts using simple gestures.

![Platform](https://img.shields.io/badge/platform-Even%20G2-green)
![SDK](https://img.shields.io/badge/sdk-0.0.9-blue)
![License](https://img.shields.io/badge/license-MIT-yellow)

## Features

- **Multiple Feed Endpoints**: Best, Hot, New, Rising, Top, Controversial, r/popular, r/all
- **Subreddit Support**: Browse any subreddit with configurable sorting
- **Post Interactions**: Upvote, downvote, hide, and save posts
- **Comments**: View top comments for any post
- **Background Sync**: Auto-refresh feeds at configurable intervals
- **Smart Caching**: Multi-level caching with seen post tracking
- **Rate Limit Management**: Automatic throttling to respect Reddit limits
- **Cookie-based Auth**: Simple authentication using Reddit session cookies

## Configuration (One-Time Setup)

The Reddit Client uses a **separate configuration page** for authentication, similar to how DisplayPlusMusic handles Spotify auth.

### Quick Setup

1. **Visit the config page:**
   - Production: https://plungarini.github.io/reddit-client-even/config.html
   - Local dev: http://localhost:5173/config.html

2. **Get your Reddit token:**
   - Open [reddit.com](https://www.reddit.com) and log in
   - Press **F12** (or Cmd+Option+I on Mac) to open DevTools
   - Go to **Application** → **Cookies** → **https://www.reddit.com**
   - Find `token_v2` and copy its value

3. **Configure the app:**
   - Paste your token in the config page
   - Choose your default feed (Hot, New, Top, etc.)
   - Set auto-refresh preferences
   - Click **Save All Settings**

4. **Use on G2:**
   - Your settings are stored in localStorage (shared with Safari WebView)
   - Open the Reddit Client app on your G2 glasses
   - Everything works automatically!

### How It Works

The configuration is stored in your browser's `localStorage`. Since the Even Hub WebView shares storage with Safari on iOS, the G2 app can read the same configuration you saved on the config page.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Config Page    │────▶│  localStorage   │◀────│  G2 App (WebView│
│  (GitHub Pages) │     │  (iOS Safari)   │     │  / Even Hub)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Controls

| Gesture | Action |
|---------|--------|
| Swipe Forward | Next post / Scroll down |
| Swipe Backward | Previous post / Scroll up |
| Single Tap | Open post / View comments |
| Double Tap | Go back / Open menu |

## Development

### Prerequisites

- Node.js 18+
- Even Realities G2 glasses paired with the Even app

### Local Development

```bash
# Clone the repository
git clone git@github.com:plungarini/reddit-client-even.git
cd reddit-client-even

# Install dependencies
npm install

# Start development server
npm run dev
```

The dev server will start at `http://localhost:5173`. 

**Important:** Visit `http://localhost:5173/config.html` first to configure your Reddit auth before testing the app.

### Running on G2 Glasses

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Generate QR code
npm run qr
```

Scan the QR code with the Even app to load the app on your glasses.

### Building for Production

```bash
npm run build
```

This creates a `dist/` folder with the built app. The config page (`config.html`) is automatically included.

### Deploying to GitHub Pages

1. Push your code to GitHub
2. Go to **Settings** → **Pages** in your repo
3. Select **GitHub Actions** as the source
4. The workflow (`.github/workflows/deploy.yml`) will auto-deploy on push to main

Your app will be available at:
- App: `https://yourusername.github.io/reddit-client-even/`
- Config: `https://yourusername.github.io/reddit-client-even/config.html`

## Architecture

```
src/
├── services/
│   ├── reddit/          # Reddit API client
│   │   ├── client.ts    # HTTP client with auth
│   │   ├── auth.ts      # Authentication manager
│   │   └── rate-limiter.ts
│   ├── cache/           # Caching layer
│   │   ├── storage.ts   # IndexedDB storage
│   │   └── post-cache.ts
│   └── sync/            # Background sync
│       ├── sync-engine.ts
│       └── scheduler.ts
├── state/               # Reactive state management
│   ├── post-store.ts
│   └── ui-manager.ts
├── ui/                  # Even Hub UI components
│   └── components/
│       ├── feed-view.ts
│       ├── detail-view.ts
│       ├── comment-view.ts
│       └── menu-view.ts
├── config/
│   └── app-config.ts    # Default configuration
├── types/
│   └── index.ts         # Type definitions
└── main.ts              # App entry point
```

### Configuration System

The app uses a two-part configuration system:

1. **Auth Storage** (`reddit-client-auth` localStorage key):
   ```typescript
   {
     tokenV2: string;
     userAgent: string;
     savedAt: string;
   }
   ```

2. **Config Storage** (`reddit-client-config` localStorage key):
   ```typescript
   {
     feed: { endpoint, subreddit, sort, time, limit };
     sync: { enabled, intervalMinutes };
   }
   ```

### Reddit API Endpoints

The app supports all major Reddit feed endpoints:

| Endpoint | Auth Required | Description |
|----------|---------------|-------------|
| `/best` | Yes | Personalized best feed |
| `/hot` | No | Currently trending posts |
| `/new` | No | Newest posts first |
| `/rising` | No | Posts gaining popularity |
| `/top` | No | Top posts by time period |
| `/controversial` | No | Most controversial posts |
| `/r/popular` | No | Popular across Reddit |
| `/r/all` | No | Posts from all of Reddit |
| `/r/{subreddit}` | No | Specific subreddit feed |

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run preview      # Preview production build
npm run qr           # Generate QR code for G2
npm run pack         # Build and package as .ehpk
npm run test         # Run tests
npm run typecheck    # TypeScript type checking
```

## API Access (Debug)

The app exposes a global API for debugging in browser console:

```javascript
// Navigation
window.redditClient.next()           // Next post
window.redditClient.prev()           // Previous post
window.redditClient.view('comments') // View comments
window.redditClient.back()           // Go back

// Feed
window.redditClient.loadFeed('hot')  // Load specific feed
window.redditClient.refresh()        // Refresh current feed

// Interactions
window.redditClient.upvote()         // Upvote current post
window.redditClient.downvote()       // Downvote current post
window.redditClient.hide()           // Hide current post
window.redditClient.save()           // Save current post

// Sync
window.redditClient.sync()           // Trigger manual sync
window.redditClient.syncStatus()     // Get sync status

// Config
window.redditClient.config()         // Get current config
window.redditClient.reloadConfig()   // Reload from localStorage

// Stats
window.redditClient.cacheStats()     // Get cache statistics
window.redditClient.storageStats()   // Get storage statistics
```

## Caching Strategy

The app uses a two-level caching system:

1. **Memory Cache**: LRU cache for current session (fast access)
2. **IndexedDB**: Persistent storage across sessions

Cache keys are generated from feed configuration for proper isolation. Seen posts are tracked separately for deduplication.

## Rate Limiting

Reddit API rate limits are automatically tracked and respected:

- **OAuth**: 60 requests/minute
- **Cookie-based**: ~30-40 requests/minute
- **Unauthenticated**: ~10-20 requests/minute

The app automatically throttles requests when approaching limits based on response headers.

## Security

- Auth tokens stored in localStorage (device only)
- No sensitive data logged to console
- All Reddit requests use HTTPS
- Rate limiting prevents API abuse
- Token never sent to any third-party server

## Troubleshooting

### "Setup Required" message on G2

1. Visit the config page on your iPhone's Safari browser
2. Enter your Reddit token and save
3. Re-open the Reddit Client app on G2

### Authentication Issues

If you see auth errors:
1. Token may have expired - get a fresh one from reddit.com
2. Visit config page and update your token
3. Tap "Clear All Data" in config if issues persist

### Rate Limiting

If you see rate limit errors:
1. Reduce sync interval in config (try 60 minutes)
2. Lower posts per fetch (try 10-15)
3. Wait for rate limit reset

### Feed Not Loading

1. Check that you have internet connection
2. Verify token is still valid (visit reddit.com)
3. Try a different feed endpoint
4. Check G2 connection status

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Based on [reddit-pi](https://github.com/plungarini/pi) service architecture
- Configuration approach inspired by [DisplayPlusMusic](https://github.com/Oliemanq/DisplayPlusMusic)
- Built for [Even Realities G2](https://www.evenrealities.com)
- Uses [Even Hub SDK](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)
