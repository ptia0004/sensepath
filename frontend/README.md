# SensePath Frontend (React)

Industry-standard React frontend migrated from the plain HTML prototype
(`frontend-legacy/`) for Iteration 1 mentor requirements.

## Why React?

Course feedback required moving from plain HTML/CSS/JS to a framework so the
Frontend Lead can explain modular structure (components, hooks, API client)
instead of one large `index.html` script.

## Structure (explain this to your mentor)

```text
frontend/
  src/
    main.jsx                 # React entry: mounts <App /> into #root
    App.jsx                  # Page navigation + shared state
    constants.js             # CBD, report types, Cloud Run URL
    api/client.js            # apiFetch() — Pages → Cloud Run, local → proxy
    hooks/
      useAppData.js          # Loads reports, refuges, model health
      usePreferences.js      # localStorage preferences
    utils/
      geo.js                 # Distance + route sensory scoring
      routing.js             # OSRM walking routes
      markers.js             # Leaflet marker helpers
    components/
      Nav.jsx                # Top navigation
      map/SenseMap.jsx       # Reusable Leaflet map (react-leaflet)
    pages/
      MapPage.jsx            # Community map dashboard
      ReportStep1.jsx        # Category selection
      ReportStep2.jsx        # Map pick + submit report
      PublishedPage.jsx      # Confirmation
    styles/app.css           # Migrated visual design
  security/                  # Existing client validation helpers
  frontend-legacy/           # Previous plain-HTML build (reference only)
```

## Local development

Terminal 1 — API:

```bash
cd /path/to/Sensepath-backend
source venv/bin/activate
PORT=5001 python run.py
```

Terminal 2 — React (Vite):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to Flask on port 5001.

## Production build (GitHub Pages / Cloud Run)

```bash
cd frontend
npm run build
```

Output is `frontend/dist/`.

- **GitHub Pages:** copy `dist/` contents to the Pages publish folder (or push
  `dist` assets). Keep `API_BASE` logic pointing at Cloud Run for `*.github.io`.
- **Cloud Run:** Dockerfile runs `npm run build` and Flask serves `frontend/dist`.

## Acceptance criteria mapping

| AC | How this repo satisfies it |
|----|----------------------------|
| AC1 React framework | Vite + React 19 + react-leaflet |
| AC2 Explainable structure | Modular files above (not one HTML blob) |
| AC3 Features preserved | Map, reports, AI predict, routes, preferences |
