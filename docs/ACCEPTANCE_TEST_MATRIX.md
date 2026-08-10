# SensePath acceptance test matrix

| Requirement | Implementation/evidence | Status |
|---|---|---|
| Submit a sensory report in fewer than three steps | Category → confirmation → submit in `frontend/index.html` | Pass |
| New reports appear on the map within one minute | `POST /api/reports`, immediate reload and marker rendering | Pass |
| Filter reports by category | Existing filter controls now apply to API reports | Pass |
| Display location, time and incident type | Popup and Recent report card | Pass |
| Hide expired reports | SQLite/PostgreSQL expiry before `GET /api/reports`; automated test | Pass |
| Reject duplicate retries | UUID submission key and idempotent API; automated test | Pass |
| Moderate inappropriate reports | Token-protected hide/resolve/restore with audit row | Pass (API) |
| Persist sensory preferences | Versioned device storage; verified across browser reload | Pass |
| Preferences immediately affect alerts | Report filtering and route scoring use current preferences | Pass |
| Compare personalised alternatives | Three explainable conceptual route corridors | Prototype |
| Real road-network navigation | Requires routing provider and road-network integration | Not implemented |
| Real pedestrian-stress prediction | Requires timestamped pedestrian/noise/event labels | Not implemented |
| Accessibility | Labels, keyboard-operable category radios, focus indicators, live regions | Partial; formal WCAG audit required |
| Mobile and multi-browser support | Responsive CSS exists | Formal device/browser matrix required |
| Cloud deployment | Docker/Gunicorn/PostgreSQL configuration supplied | Ready; public account/link required |

Automated verification command:

```powershell
python -m unittest -v tests.test_app tests.test_pipeline
```

The team should copy these rows into LeanKit acceptance criteria and attach test
output, browser evidence, deployment link, accessibility findings, and mentor
feedback in the Project Governance Portfolio.
