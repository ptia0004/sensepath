BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE source_kind AS ENUM ('open_data', 'community', 'system');
CREATE TYPE place_kind AS ENUM ('building', 'landmark', 'street_furniture');
CREATE TYPE report_status AS ENUM ('active', 'expired', 'under_review', 'hidden', 'resolved');
CREATE TYPE review_action AS ENUM ('approve', 'hide', 'resolve', 'mark_duplicate', 'restore');
CREATE TYPE actor_kind AS ENUM ('system', 'moderator');
CREATE TYPE validation_result AS ENUM ('supports', 'contradicts', 'inconclusive');

CREATE TABLE data_source (
    source_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_code VARCHAR(50) NOT NULL UNIQUE,
    source_kind source_kind NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    source_url TEXT,
    licence_name VARCHAR(120),
    last_checked_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    availability_status VARCHAR(30) NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refuge_place (
    place_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id SMALLINT NOT NULL REFERENCES data_source(source_id),
    source_record_id VARCHAR(100) NOT NULL,
    place_kind place_kind NOT NULL,
    name VARCHAR(250) NOT NULL,
    subtype VARCHAR(150),
    description TEXT,
    street_address TEXT,
    locality VARCHAR(120),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accessibility_level VARCHAR(80),
    accessibility_description TEXT,
    accessibility_rating NUMERIC(3,1) CHECK (accessibility_rating BETWEEN 0 AND 5),
    condition_rating NUMERIC(4,2) CHECK (condition_rating BETWEEN 0 AND 5),
    condition_category VARCHAR(30),
    observed_on DATE,
    source_updated_on DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, source_record_id)
);

CREATE INDEX refuge_place_coordinates_idx ON refuge_place (latitude, longitude) WHERE is_active;
CREATE INDEX refuge_place_kind_idx ON refuge_place (place_kind, subtype) WHERE is_active;
CREATE INDEX refuge_place_name_search_idx ON refuge_place USING gin (to_tsvector('english', name));

CREATE TABLE report_category (
    category_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_code VARCHAR(40) NOT NULL UNIQUE,
    display_name VARCHAR(80) NOT NULL,
    filter_group VARCHAR(40) NOT NULL,
    default_ttl INTERVAL NOT NULL CHECK (default_ttl > interval '0'),
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE community_report (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id SMALLINT NOT NULL REFERENCES report_category(category_id),
    source_id SMALLINT NOT NULL REFERENCES data_source(source_id),
    approximate_latitude DOUBLE PRECISION NOT NULL CHECK (approximate_latitude BETWEEN -90 AND 90),
    approximate_longitude DOUBLE PRECISION NOT NULL CHECK (approximate_longitude BETWEEN -180 AND 180),
    approximate_location_label VARCHAR(200),
    optional_comment VARCHAR(300),
    submission_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    status report_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    duplicate_of_report_id UUID REFERENCES community_report(report_id),
    CHECK (expires_at > created_at),
    CHECK (duplicate_of_report_id IS NULL OR duplicate_of_report_id <> report_id)
);

CREATE INDEX community_report_map_idx
    ON community_report (approximate_latitude, approximate_longitude, expires_at)
    WHERE status = 'active';
CREATE INDEX community_report_category_idx ON community_report (category_id, created_at DESC);

CREATE TABLE official_observation (
    observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id SMALLINT NOT NULL REFERENCES data_source(source_id),
    source_record_id VARCHAR(120),
    observation_type VARCHAR(80) NOT NULL,
    approximate_latitude DOUBLE PRECISION CHECK (approximate_latitude BETWEEN -90 AND 90),
    approximate_longitude DOUBLE PRECISION CHECK (approximate_longitude BETWEEN -180 AND 180),
    area_or_service_reference VARCHAR(200),
    observed_at TIMESTAMPTZ NOT NULL,
    stale_at TIMESTAMPTZ NOT NULL,
    quality_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
    source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (stale_at > observed_at),
    UNIQUE NULLS NOT DISTINCT (source_id, source_record_id)
);

CREATE TABLE report_observation_match (
    report_id UUID NOT NULL REFERENCES community_report(report_id) ON DELETE CASCADE,
    observation_id UUID NOT NULL REFERENCES official_observation(observation_id) ON DELETE CASCADE,
    validation_result validation_result NOT NULL,
    match_score NUMERIC(5,4) NOT NULL CHECK (match_score BETWEEN 0 AND 1),
    matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (report_id, observation_id)
);

CREATE TABLE report_review (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES community_report(report_id) ON DELETE CASCADE,
    review_action review_action NOT NULL,
    review_reason VARCHAR(500),
    actor_type actor_kind NOT NULL,
    actor_reference VARCHAR(120),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX report_review_report_idx ON report_review (report_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER refuge_place_set_updated_at
BEFORE UPDATE ON refuge_place
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION set_report_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        SELECT NEW.created_at + default_ttl INTO NEW.expires_at
        FROM report_category WHERE category_id = NEW.category_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER community_report_set_expiry
BEFORE INSERT ON community_report
FOR EACH ROW EXECUTE FUNCTION set_report_expiry();

CREATE OR REPLACE FUNCTION expire_community_reports()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE changed_count INTEGER;
BEGIN
    UPDATE community_report
    SET status = 'expired'
    WHERE status = 'active' AND expires_at <= now();
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION distance_metres(
    lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT 6371000 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
    ));
$$;

CREATE OR REPLACE FUNCTION nearby_refuges(
    user_lat DOUBLE PRECISION,
    user_lon DOUBLE PRECISION,
    radius_metres INTEGER DEFAULT 1000,
    result_limit INTEGER DEFAULT 50
) RETURNS TABLE (
    place_id UUID, name VARCHAR, place_kind place_kind, subtype VARCHAR,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    accessibility_rating NUMERIC, distance_metres DOUBLE PRECISION
) LANGUAGE sql STABLE AS $$
    SELECT p.place_id, p.name, p.place_kind, p.subtype, p.latitude, p.longitude,
           p.accessibility_rating,
           distance_metres(user_lat, user_lon, p.latitude, p.longitude) AS distance_metres
    FROM refuge_place p
    WHERE p.is_active
      AND p.latitude BETWEEN user_lat - radius_metres / 111320.0 AND user_lat + radius_metres / 111320.0
      AND p.longitude BETWEEN user_lon - radius_metres / (111320.0 * greatest(cos(radians(user_lat)), 0.01))
                          AND user_lon + radius_metres / (111320.0 * greatest(cos(radians(user_lat)), 0.01))
      AND distance_metres(user_lat, user_lon, p.latitude, p.longitude) <= radius_metres
    ORDER BY distance_metres
    LIMIT least(greatest(result_limit, 1), 200);
$$;

CREATE VIEW active_community_reports AS
SELECT r.report_id, c.category_code, c.display_name AS category_name,
       r.approximate_latitude, r.approximate_longitude,
       r.approximate_location_label, r.optional_comment,
       r.created_at, r.expires_at
FROM community_report r
JOIN report_category c USING (category_id)
WHERE r.status = 'active' AND r.expires_at > now() AND c.is_active;

COMMIT;
