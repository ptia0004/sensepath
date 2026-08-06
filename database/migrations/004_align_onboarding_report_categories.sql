BEGIN;

UPDATE report_category
SET default_ttl = interval '2 hours'
WHERE category_code IN ('crowds', 'loud', 'roadworks');

INSERT INTO report_category (category_code, display_name, filter_group, default_ttl, is_active)
VALUES ('construction', 'Construction', 'construction', interval '2 hours', true)
ON CONFLICT (category_code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    filter_group = EXCLUDED.filter_group,
    default_ttl = EXCLUDED.default_ttl,
    is_active = true;

-- The earlier prototype used "heavy" as a separate category. US2.2 now uses
-- Crowds plus Construction, so keep old rows referentially valid but prevent
-- new/active-map use of the obsolete dictionary value.
UPDATE report_category
SET is_active = false,
    default_ttl = interval '2 hours'
WHERE category_code = 'heavy';

COMMIT;
