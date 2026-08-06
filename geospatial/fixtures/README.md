# Fixture Data Guide

## What is a fixture?

A fixture is a fixed, reusable set of sample input data used for development, automated testing, and demonstrations.

The JSON files in this directory simulate responses from external data sources. They allow the team to test the application consistently when:

- an API key is not yet available;
- an external API is temporarily unavailable;
- real-time data changes too frequently for reproducible tests; or
- a GTFS-Realtime Protocol Buffer response must first be decoded by the backend.

> **Important:** These fixtures are not live data and do not represent current transport or weather conditions. Demonstrations must clearly label them as fixture, sample, or simulated data.

## Files

### `gtfs-service-alert.fixture.json`

This file simulates a Transport Victoria GTFS-Realtime Service Alert that has already been decoded from Protocol Buffers into JSON.

Sample scenario: Route 96 tram services are temporarily diverted because of construction.

Key fields:

| Field | Meaning |
|---|---|
| `header.timestamp` | Time at which the GTFS-Realtime feed was generated |
| `entity[].id` | Unique identifier for the event within the feed |
| `active_period` | Start and end times of the event |
| `informed_entity.route_id` | Identifier of the affected route |
| `informed_entity.stop_id` | Identifier of the affected stop |
| `cause` | Cause of the event, such as `CONSTRUCTION` |
| `effect` | Effect on the transport service, such as `DETOUR` |
| `header_text` | User-facing event title |
| `description_text` | User-facing event description |

This fixture verifies that the application:

- retains the data source and feed timestamp;
- extracts the affected route or stop correctly;
- displays the event cause, effect, and description; and
- marks the feed as stale after the configured freshness threshold.

### `bom-weather.fixture.json`

This file simulates a Bureau of Meteorology station-observation JSON response.

Sample scenario: Melbourne Olympic Park reports light rain and an air temperature of 13.8°C.

Key fields:

| Field | Meaning |
|---|---|
| `observations.header` | Data product and station metadata |
| `wmo` | BOM/WMO station identifier |
| `name` | Observation-station name |
| `lat`, `lon` | Observation-station coordinates |
| `aifstime_utc` | UTC observation time in `YYYYMMDDhhmmss` format |
| `air_temp` | Air temperature in degrees Celsius |
| `apparent_t` | Apparent temperature in degrees Celsius |
| `rain_trace` | Rainfall since 9:00 am in millimetres |
| `gust_kmh` | Wind-gust speed in kilometres per hour |
| `weather` | Description of the observed weather |

This fixture verifies that the application:

- retains the station, coordinates, and observation time;
- normalizes temperature, rainfall, and wind values correctly;
- represents missing fields as `null` or unavailable instead of incorrectly converting them to `0`; and
- marks an observation as stale after the configured freshness threshold.

## How the fixtures are used

[`../mapData.js`](../mapData.js) provides two normalization functions:

- `normalizeGtfsAlerts()` converts a decoded GTFS-Realtime alert into a SensePath transport-disruption context feature.
- `normalizeBomWeather()` converts a BOM observation into a SensePath weather context feature.

[`../geospatialTest.js`](../geospatialTest.js) reads the fixtures in this directory and verifies their source, timestamp, location, missing-value, and freshness rules.

Run the tests from the `sensepath` directory:

```powershell
node geospatial/geospatialTest.js
```

Expected result:

```text
8/8 geospatial and data-quality tests passed.
```

## Rules for modifying or adding fixtures

1. Fixtures must remain deterministic. Do not generate random values during a test run.
2. Do not include real API keys, user identities, device identifiers, or precise travel histories.
3. Clearly document timestamps, sources, coordinates, and units.
4. Omit missing fields or set them to `null`; do not use `0` to represent an unknown value.
5. Add a new fixture file for a new failure or edge-case scenario instead of overwriting the normal scenario.
6. Add a corresponding test to `geospatialTest.js` for every new fixture.

Suggested future fixtures:

- `gtfs-service-alert.missing-route.fixture.json`: alert with missing route information;
- `gtfs-service-alert.stale.fixture.json`: expired transport feed;
- `bom-weather.missing-values.fixture.json`: observation with missing weather fields; and
- `bom-weather.stale.fixture.json`: stale weather observation.

## Relationship to live APIs

Development and automated tests use fixtures. In production, the backend requests the live APIs and converts their responses into the same normalized structures used by these fixtures.

Credentials such as the Transport Victoria `KeyID` must be stored in backend environment variables or a secrets-management service. They must never be committed to this directory or to the Git repository.
