# SensePath geospatial and context-data handover

## Scope and ownership

This folder provides the evidence for DS2 deliverables `US2.2`, `T-DS2-01` and `T-DS2-02`.

- `mapData.js` contains testable community-map lifecycle, filtering, freshness and adapter logic.
- `fixtures/` contains reproducible decoded GTFS-Realtime and BOM scenarios. The GTFS fixture represents the structure after a backend has decoded the Protocol Buffer response.
- `geospatialTest.js` covers expiry, filtering, visible bounds, duplicates, missing fields, stale data and source/timestamp traceability.

Run the evidence suite from the `sensepath` folder:

```powershell
node geospatial/geospatialTest.js
```

## Source register

| Source | Purpose | Format and access | Refresh/freshness rule | Usage note |
|---|---|---|---|---|
| [Transport Victoria GTFS-Realtime](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime) | Trip updates and service alerts for disruption context | Protocol Buffers; portal account and `KeyID` request header required | Feed timestamp older than 5 minutes is labelled cached/stale | Retain route/stop context, feed timestamp and source; never convert a missing delay or route value to zero |
| [Bureau of Meteorology Weather Data Services](https://www.bom.gov.au/catalogue/data-feeds.shtml) | Rain, temperature and wind context | JSON observation feeds are available for individual stations | Observation older than 30 minutes is labelled cached/stale | BOM warns that automated observations may not be quality checked; retain station and observation time |
| SensePath community reports | Temporary local sensory context | PostgreSQL `community_report` and `active_community_reports` view | Two-hour MVP expiry; service data older than 15 minutes is stale | Approximate location only; no identity or raw travel history |

The prototype uses fixtures because API credentials must not be committed. Production retrieval belongs in the backend, where the `KeyID` and network failure handling can be protected.

## Normalized context feature rules

Every transport or weather output keeps:

- a stable source code, source name and source URL;
- `observedAt`, `staleAt` and `qualityStatus`;
- a location or affected route/stop context;
- unsupported or missing metrics as `null`, never as `0`.

The fixtures reproduce one Route 96 disruption and one Melbourne Olympic Park light-rain observation. They are examples for integration and acceptance testing, not claims about current conditions.

## Community-report lifecycle and privacy

1. The category must exist in the controlled category dictionary.
2. Approximate latitude and longitude must be valid; raw travel paths are not accepted.
3. `created_at` is recorded at submission and `expires_at` is derived as `created_at + 2 hours`.
4. `submission_key` is an opaque idempotency key. A repeated key cannot create a second report or marker.
5. Active-map queries exclude expired, hidden and invalid records.
6. Community reports remain explicitly labelled and are not presented as official observations.
7. No account, device fingerprint or user identity is linked to a report.

## Reproducible build states

Serve the `sensepath` folder, then open:

- `/?dataState=live` - active, non-expired reports;
- `/?dataState=empty` - clear empty state while the map remains usable;
- `/?dataState=stale` - cached label and last-updated time;
- `/?dataState=unavailable` - service failure label and last-updated time.

Example local server:

```powershell
python -m http.server 4173
```

## US2.2 acceptance traceability

| Criterion | Build behaviour | Evidence |
|---|---|---|
| AC1 | Only active reports inside current Leaflet bounds are rendered | expiry and visible-area tests; live screenshot |
| AC2 | Popup includes category, approximate location, age and `Community report` | marker screenshot |
| AC3 | Four category checkboxes update the layer in place | filter test and interaction screenshot |
| AC4 | All MVP categories use the documented two-hour TTL | lifecycle test and database reference data |
| AC5 | `No recent reports` appears without removing the map | `dataState=empty` screenshot |
| AC6 | Cached/unavailable states show last-updated time | stale/unavailable test and screenshot |
| AC7 | Inputs and markers are labelled/focusable; responsive layout keeps content unclipped | keyboard, desktop and mobile smoke-test screenshots |

For the LeanKit card, attach the test output, desktop/mobile screenshots, deployed URL, commit/PR link and peer-review evidence. Do not mark the card done until those links are present.
