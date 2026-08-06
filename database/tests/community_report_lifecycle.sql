BEGIN;

DO $$
DECLARE
    community_source SMALLINT;
    crowds_category SMALLINT;
    inserted community_report%ROWTYPE;
BEGIN
    SELECT source_id INTO community_source FROM data_source WHERE source_code = 'community';
    SELECT category_id INTO crowds_category FROM report_category WHERE category_code = 'crowds';

    INSERT INTO community_report (
        category_id, source_id, approximate_latitude, approximate_longitude,
        approximate_location_label, created_at
    ) VALUES (
        crowds_category, community_source, -37.8136, 144.9631,
        'Melbourne CBD', timestamptz '2026-08-06 04:00:00+00'
    ) RETURNING * INTO inserted;

    IF inserted.expires_at <> inserted.created_at + interval '2 hours' THEN
        RAISE EXCEPTION 'Expected two-hour expiry, got %', inserted.expires_at - inserted.created_at;
    END IF;

    UPDATE community_report
    SET created_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
    WHERE report_id = inserted.report_id;

    IF EXISTS (SELECT 1 FROM active_community_reports WHERE report_id = inserted.report_id) THEN
        RAISE EXCEPTION 'Expired report remained in active_community_reports';
    END IF;
END;
$$;

ROLLBACK;
