BEGIN;

INSERT INTO data_source (source_code, source_kind, display_name, source_url, licence_name)
VALUES
    ('community', 'community', 'SensePath community reports', NULL, NULL),
    ('com_buildings', 'open_data', 'City of Melbourne building information', 'https://data.melbourne.vic.gov.au/', 'City of Melbourne Open Data Licence'),
    ('com_landmarks', 'open_data', 'City of Melbourne landmarks and places of interest', 'https://data.melbourne.vic.gov.au/', 'City of Melbourne Open Data Licence'),
    ('com_street_furniture', 'open_data', 'City of Melbourne street furniture', 'https://data.melbourne.vic.gov.au/', 'City of Melbourne Open Data Licence'),
    ('system', 'system', 'SensePath system observations', NULL, NULL);

INSERT INTO report_category (category_code, display_name, filter_group, default_ttl)
VALUES
    ('crowds', 'Crowds', 'crowds', interval '2 hours'),
    ('loud', 'Loud event', 'loud', interval '2 hours'),
    ('roadworks', 'Roadworks', 'roadworks', interval '8 hours'),
    ('heavy', 'Heavy crowds', 'heavy', interval '1 hour'),
    ('other', 'Other sensory issue', 'other', interval '2 hours');

COMMIT;
