# Datasets and Pre-processing Scripts

---

## ERD

The diagram below reflects the implemented PostgreSQL 17 schema in
`data/database/init/001_schema.sql`. The SQLite development fallback only
implements the community-report and review subset.

```mermaid
erDiagram
    DATA_SOURCE ||--o{ REFUGE_PLACE : provides
    DATA_SOURCE ||--o{ COMMUNITY_REPORT : receives
    DATA_SOURCE ||--o{ OFFICIAL_OBSERVATION : provides
    REPORT_CATEGORY ||--o{ COMMUNITY_REPORT : categorises
    COMMUNITY_REPORT ||--o{ REPORT_REVIEW : has
    COMMUNITY_REPORT ||--o{ REPORT_OBSERVATION_MATCH : has
    OFFICIAL_OBSERVATION ||--o{ REPORT_OBSERVATION_MATCH : matched_by
    COMMUNITY_REPORT o|--o{ COMMUNITY_REPORT : duplicated_by

    DATA_SOURCE {
        smallint source_id PK
        varchar source_code UK
        source_kind source_kind
        varchar display_name
        text source_url
        varchar licence_name
        timestamptz last_checked_at
        timestamptz last_success_at
        varchar availability_status
        timestamptz created_at
    }

    REFUGE_PLACE {
        uuid place_id PK
        smallint source_id FK
        varchar source_record_id
        place_kind place_kind
        varchar name
        varchar subtype
        text description
        text street_address
        varchar locality
        double_precision latitude
        double_precision longitude
        varchar accessibility_level
        text accessibility_description
        numeric accessibility_rating
        numeric condition_rating
        varchar condition_category
        date observed_on
        date source_updated_on
        boolean is_active
        jsonb source_payload
        timestamptz created_at
        timestamptz updated_at
    }

    REPORT_CATEGORY {
        smallint category_id PK
        varchar category_code UK
        varchar display_name
        varchar filter_group
        interval default_ttl
        boolean is_active
    }

    COMMUNITY_REPORT {
        uuid report_id PK
        smallint category_id FK
        smallint source_id FK
        double_precision approximate_latitude
        double_precision approximate_longitude
        varchar approximate_location_label
        varchar optional_comment
        uuid submission_key UK
        report_status status
        timestamptz created_at
        timestamptz expires_at
        uuid duplicate_of_report_id FK
    }

    OFFICIAL_OBSERVATION {
        uuid observation_id PK
        smallint source_id FK
        varchar source_record_id
        varchar observation_type
        double_precision approximate_latitude
        double_precision approximate_longitude
        varchar area_or_service_reference
        timestamptz observed_at
        timestamptz stale_at
        varchar quality_status
        jsonb source_payload
        timestamptz created_at
    }

    REPORT_OBSERVATION_MATCH {
        uuid report_id PK, FK
        uuid observation_id PK, FK
        varchar validation_result
        numeric match_score
        timestamptz matched_at
    }

    REPORT_REVIEW {
        uuid review_id PK
        uuid report_id FK
        review_action review_action
        varchar review_reason
        actor_kind actor_type
        varchar actor_reference
        timestamptz reviewed_at
    }
```

The physical schema also enforces the composite unique constraints
`REFUGE_PLACE(source_id, source_record_id)` and
`OFFICIAL_OBSERVATION(source_id, source_record_id)`. The latter uses
`NULLS NOT DISTINCT`. `REPORT_OBSERVATION_MATCH(report_id, observation_id)` is
the composite primary key. Coordinates, ratings, match scores, expiry times and
self-duplicate references are protected by `CHECK` constraints in the schema.
