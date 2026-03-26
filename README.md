# AlphaScope

**NSE stock intelligence terminal — dual-signal alpha detection with live prices, AI-powered analysis, and real-time market data.**

Built for the ET AI Hackathon 2026 (PS6 — AI for the Indian Investor). 

Prototype deployed successfully in netlify 
The deployment link - https://alphascope-2.netlify.app/

---

## What it does

AlphaScope cross-validates two independent signal sources to surface high-conviction trade setups on NSE stocks:

- **Chart Pattern Agent** — detects 5 pattern types (52-week breakout, golden cross, RSI divergence, Bollinger squeeze, support test) with per-stock historical win rates
- **Opportunity Radar Agent** — scores fundamental events: institutional bulk deals, earnings surprises, promoter buying, contract wins
- **Alpha Fusion Engine** — only surfaces stocks where BOTH agents fire simultaneously, reducing false positives
- **AI Briefs** — Claude API with live web search writes a fresh 3-sentence analysis for every signal, every 30 minutes

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML/CSS/JS — 4 interlinked pages, dark/light mode |
| Backend | Netlify Functions (serverless Node.js) |
| Auth | bcrypt password hashing + JWT sessions |
| Database | JSON file store (upgradeable to Netlify Blobs) |
| Market data | Yahoo Finance API — no key required |
| AI | Anthropic Claude API (`claude-sonnet-4`) + web search tool |
| Deployment | Netlify |

---

## Pages

| Page | Path | Description |
|---|---|---|
| Login / Register | `/` | Auth with bcrypt + JWT |
| Dashboard | `/pages/dashboard.html` | Signal feed, detail panel, market sidebar |
| Stock Detail | `/pages/stock.html?symbol=TCS` | Full analysis for any NSE stock |
| Bookmarks | `/pages/bookmarks.html` | Personal watchlist per user |

---

## Features

- **Live NSE prices** pulled from Yahoo Finance on every request — no stale data
- **Gold, Silver, Crude Oil** prices in the live ticker and sidebar
- **USD/INR forex + Bitcoin** in the market sidebar
- **India VIX** with a real-time fear/greed gauge
- **Sector heatmap** — 8 sectors color-coded by performance
- **Animated ticker** — scrolls all signals + all market instruments simultaneously
- **Search any stock** — type a name or symbol → get full analysis instantly
- **Bookmarks per user** — stored server-side, persist across sessions
- **Dark / Light mode** — persisted per browser
- **Auto-refresh** every 30 minutes in the background

---

## API endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/.netlify/functions/auth/register` | — | Create account |
| `POST` | `/.netlify/functions/auth/login` | — | Login, returns JWT |
| `GET` | `/.netlify/functions/signals` | JWT | Alpha signals (cached 30 min) |
| `GET` | `/.netlify/functions/signals?force=true` | JWT | Force fresh scan |
| `GET` | `/.netlify/functions/analysis?symbol=TCS` | JWT | Full analysis for any stock |
| `GET` | `/.netlify/functions/stocks/search?q=tata` | JWT | Search NSE stocks |
| `GET` | `/.netlify/functions/market` | — | Gold, Silver, Indices, VIX |
| `GET` | `/.netlify/functions/bookmarks` | JWT | Get user bookmarks |
| `POST` | `/.netlify/functions/bookmarks` | JWT | Add bookmark |
| `DELETE` | `/.netlify/functions/bookmarks/:symbol` | JWT | Remove bookmark |

---

## Deploy to Netlify

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "AlphaScope v2"
gh repo create alphascope --public --push
```

### Step 2 — Import on Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Connect GitHub and select your repo
3. Configure build settings:
   - **Build command**: *(leave empty)*
   - **Publish directory**: `public`
4. Click **Deploy site**

### Step 3 — Set environment variables

In Netlify dashboard → **Site configuration** → **Environment variables** → **Add a variable**:

| Key | Value | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Yes (for AI briefs) |
| `JWT_SECRET` | Any long random string | Yes |

Get your Anthropic API key at [console.anthropic.com](https://console.anthropic.com).

### Step 4 — Redeploy

After adding env vars, go to **Deploys** → **Trigger deploy** → **Deploy site**.

Your site is live at `https://your-site-name.netlify.app`.

---

## Local development

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env.local
# Edit .env.local — add ANTHROPIC_API_KEY and JWT_SECRET

# Install Netlify CLI
npm install -g netlify-cli

# Start local dev server (runs functions + frontend)
netlify dev
# Open http://localhost:8888
```

---

## Project structure

```
alphascope-v2/
├── netlify.toml                    # Build config + URL redirects
├── package.json                    # Dependencies
├── .env.example                    # Environment variable template
│
├── netlify/functions/
│   ├── utils.js                    # JWT, bcrypt, CORS helpers
│   ├── db.js                       # User + bookmark store
│   ├── auth.js                     # Register + login
│   ├── stocks.js                   # Yahoo Finance data fetcher + search
│   ├── analysis.js                 # Chart patterns + AI brief generator
│   ├── signals.js                  # Full scan engine (cached 30 min)
│   └── market.js                   # Gold, Silver, Indices, VIX, Crypto
│
├── public/
│   ├── index.html                  # Login / Register
│   ├── css/main.css                # Design system — dark/light mode
│   ├── js/app.js                   # Auth, API, Theme, Toast, Charts
│   └── pages/
│       ├── dashboard.html          # Main terminal
│       ├── stock.html              # Stock deep-dive
│       └── bookmarks.html          # Watchlist
│
└── data/
    ├── users.json                  # User accounts (auto-created)
    └── bookmarks.json              # Legacy (bookmarks now stored per-user)
```

---

## Impact model

India has 14 crore+ demat accounts. Most retail investors act on WhatsApp tips, miss institutional signals, and cannot read technicals.

AlphaScope surfaces 3–8 confirmed dual-signal setups daily from 15 liquid NSE stocks. If 1,000 users each capture a 5% move on ₹50,000 capital once per week, that is ₹2.5 crore in aggregate alpha per week — democratising the kind of signal detection that institutional desks do with teams of analysts.

The system runs on open data with zero proprietary data costs.

---

## License

MIT — built for the ET AI Hackathon 2026.
