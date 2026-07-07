# News-dashboard

A single-page news dashboard built with vanilla HTML, CSS, and JavaScript. It pulls live headlines from the [GNews API](https://gnews.io/), lets users filter by category and country, search any topic, view a source-distribution chart, and interact with a simple rule-based chat assistant — all wrapped in a responsive, accessible UI with client-side caching, debouncing, and error handling.

---

## Features

- **Live headlines** by category (general, world, business, technology, sports, science, health, entertainment) and country (India, US, UK, Australia, Canada)
- **Free-text search** across any topic, with debounced auto-search as you type
- **Analytics dashboard** — article count, unique source count, active category, last-updated time
- **Card view and chart view** — toggle between an article grid and a Chart.js bar chart of articles per source
- **Rotating featured headline** that cycles automatically every 5 seconds
- **Chat assistant** — type a category name, `chart`, `cards`, `latest`, `help`, or `search <topic>` to control the dashboard conversationally
- **Persisted preferences** — last category, country, view mode, and search term are remembered via `localStorage`
- **Resilient networking** — request caching (5-minute TTL), duplicate-request cancellation via `AbortController`, a daily request counter to avoid exceeding API limits, and visibility-aware auto-refresh (only polls when the tab is active)
- **Graceful error handling** — distinct messages for rate limits, auth errors, network failures, and offline state, each with a retry action and a fallback to last-known-good cached data
- **Loading states** — animated skeleton cards and a spinner while data is in flight; buttons disable during requests and while offline
- **A/B tested CTA** — each visitor is randomly assigned a "Read More" vs "View Full Story" link variant, tracked via `localStorage` as a lightweight engagement experiment

---

## Tech Stack

- HTML5, CSS3 (flexbox/grid, responsive breakpoints, CSS animations for skeleton loading)
- Vanilla JavaScript (ES6+, no framework, no build step)
- [Chart.js](https://www.chartjs.org/) via CDN
- [GNews API](https://gnews.io/) for headlines and search

---

## Project Structure

```
.
├── index.html            # Markup and layout
├── style.css              # Styling, responsive rules, loading/skeleton animations
├── script.js              # App logic: fetching, caching, chatbot, chart, state
└── .gitignore
```

---

## Setup (Run Locally)

1. Clone the repository:
   ```
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   ```

2. Get a free API key from [gnews.io](https://gnews.io/) (free tier: 100 requests/day).

3. Create your local config file:
   ```
   cp config.example.js config.js
   ```
   Then open `config.js` and paste in your key:
   ```javascript
   const APP_CONFIG = {
       apiKey: "YOUR_GNEWS_API_KEY_HERE"
   };
   ```

4. Open `index.html` directly in a browser, or serve it locally (recommended, avoids some browser file:// restrictions):
   ```
   npx serve .
   ```

`config.js` is listed in `.gitignore` so your personal key is never pushed to GitHub.

---

## API Usage

The app calls two GNews endpoints:

- `GET /api/v4/top-headlines` — category + country browsing
- `GET /api/v4/search` — free-text topic search

Both are called directly from the browser (GNews supports CORS for client-side requests). To stay within the free tier's daily limit, the app:

- Caches responses per category/country/search combination for 5 minutes
- Tracks a daily request count in `localStorage` and stops making new calls once a configurable limit is reached, falling back to cached data
- Cancels any in-flight request when a new one is triggered, so rapid input changes don't stack up calls
- Debounces the search box (500ms) so typing doesn't fire a request per keystroke

---

## Deployment

This is a fully static site, so it deploys with no build step on any static host.

### Netlify
1. Push this repo to GitHub.
2. In Netlify, click **Add new site → Import an existing project**, connect your GitHub repo.
3. Build command: leave blank. Publish directory: `.` (project root).
4. **Important:** since this is a client-side-only app, `config.js` won't exist on the deployed site unless you commit it or add it another way (see Known Limitations below) — for a portfolio demo, the simplest option is to commit a `config.js` with a key you're comfortable being public, or use Netlify's build-time environment variable injection with a small build script.

### Vercel
1. Push this repo to GitHub.
2. In Vercel, **Add New Project → Import** your repo.
3. Framework preset: **Other** (no build step needed).
4. Deploy.

### GitHub Pages
1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Source: deploy from the `main` branch, root folder.
4. Your site will be live at `https://<username>.github.io/<repo-name>/`.

---

## Known Limitations

- **API key exposure**: this is a pure front-end app with no server, so the GNews key ships to the browser and is visible in `config.js` and in network requests once deployed. This is a standard limitation of client-only apps calling a keyed API directly — the proper fix is a small serverless function (e.g. a Netlify/Vercel function) that holds the key server-side and proxies the request. That's a good "next step" to mention if asked about it, but is out of scope for this deliverable.
- **Free-tier rate limits**: GNews's free plan allows 100 requests/day; the in-app counter and cache are designed to make that budget last, but heavy testing can still exhaust it.
- **Chart re-render**: the source chart is cleared when there are no articles, rather than showing an empty-state chart.

## Possible Future Improvements

- Serverless proxy to hide the API key entirely
- Dark mode toggle (persisted via localStorage, consistent with existing preference pattern)
- Pagination or infinite scroll for more than 10 articles
- Unit tests for the caching and debounce utilities

---

## Reflection

This project started as a basic fetch-and-render news app and was built up in stages: first the API integration and card/chart views, then localStorage preferences, then error handling and loading states, then caching and rate-limit management, and finally an A/B test on the CTA link. The main challenges were avoiding redundant API calls against a low daily limit (solved with caching, debouncing, and a request counter) and making failures feel graceful rather than broken (solved with cached fallbacks and specific, actionable error messages instead of a generic "something went wrong").
