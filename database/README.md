# SensePath database

PostgreSQL 17 stores three open datasets plus the community-report workflow used by the map prototype.

## Start locally

1. Copy `.env.example` to `.env` and change the local password.
2. Run `docker compose up -d`.
3. Check `docker compose ps` and then run:

```powershell
docker compose exec postgres psql -U sensepath_admin -d sensepath -c "SELECT place_kind, count(*) FROM refuge_place GROUP BY place_kind ORDER BY place_kind;"
```

Initialization imports the CSV files only when the Docker volume is first created. Future schema changes must be added as numbered migration files and executed explicitly against existing databases.

## Main model

- `refuge_place`: buildings, landmarks and street furniture displayed as sensory refuges.
- `community_report`: temporary crowd, noise and roadwork reports.
- `official_observation`: external/system observations that can validate reports.
- `report_observation_match`: scored evidence linking reports to observations.
- `report_review`: append-only moderation audit trail.
- `data_source`: provenance and freshness for every imported resource.

No account table is stored because the current prototype accepts anonymous reports. `submission_key` is the opaque idempotency key; it must not contain a device fingerprint or personal identifier.

## Application queries

Nearby refuges:

```sql
SELECT * FROM nearby_refuges(-37.8136, 144.9631, 1000, 30);
```

Current reports:

```sql
SELECT * FROM active_community_reports ORDER BY created_at DESC;
```

Submit a report (expiry is derived from its category):

```sql
INSERT INTO community_report (
    category_id, source_id, approximate_latitude, approximate_longitude,
    approximate_location_label, optional_comment
)
SELECT c.category_id, s.source_id, -37.8136, 144.9631,
       'Melbourne CBD', 'Busy tram stop'
FROM report_category c
JOIN data_source s ON s.source_code = 'community'
WHERE c.category_code = 'crowds'
RETURNING report_id, submission_key, expires_at;
```

Expire stale rows from an application scheduler:

```sql
SELECT expire_community_reports();
```

## Production / Neon

Run schema and reference data through a direct (non-pooled) connection. For production imports, replace the local `COPY` paths with `psql \copy` or an object-storage import job. Applications should use a pooled `DATABASE_URL`; migrations and dumps should use `DIRECT_DATABASE_URL`.

Do not deploy `.env`, community free text, production dumps, or administrator credentials to Git.
