# Selfie Studio

A free, unlimited, paywall-free AI selfie filter web app. Upload a photo, pick a filter
(hairstyles, hair colors, headshots, age effects, artistic styles), and generate as many
results as you want — no credits, no subscriptions, no quotas.

**Live demo filters work fully offline.** For AI transformations, connect your own
image-generation account (Replicate, fal.ai, or any OpenAI-compatible API) in ⚙️ Settings.
Your API key is stored only in your browser and calls go directly from your browser to the
provider — this app has no backend and no server-side storage at all.

## Features

- 74 filter presets across 7 categories (hairstyles, hair colors, headshots, age,
  artistic styles, facial hair, outfits), searchable
- Drag-and-drop photo upload, processed locally in the browser
- Built-in offline canvas filters (free, instant, no account)
- Pluggable AI providers: Replicate, fal.ai, OpenAI-compatible endpoints
- Per-filter auto-tuned transformation strength (delicate tweaks vs full redraws)
- Before/after comparison slider on every result
- Batch mode: select any number of filters and generate them all in one run
- Unlimited generations — the app imposes no limits of any kind
- Result history and one-click download

## Run it

It's a fully static site — any static file server works:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Or deploy the folder to GitHub Pages, Netlify, Cloudflare Pages, etc.

## Usage policy

- **18+ only.** The app shows an age gate on first visit.
- Upload only photos of yourself or of people who have given you permission.
- Transformations are appearance/style changes only. Do not use this app to create
  sexual or intimate imagery of real people.
- Respect the terms of whatever AI provider you connect.

## Privacy

Your photo never leaves your browser unless you yourself configure and trigger an AI
provider call. There is no tracking, no analytics, no account system, and nothing is
uploaded to this app because there is no app server.

## License

MIT
