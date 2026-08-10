BEGIN;

CREATE TEMP TABLE building_import (
    property_id TEXT, building_name TEXT, street_address TEXT, clue_small_area TEXT,
    predominant_space_use TEXT, accessibility_type TEXT,
    accessibility_type_description TEXT, accessibility_rating TEXT,
    latitude TEXT, longitude TEXT
);

COPY building_import FROM '/datasets/buildings_refuge_final.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO refuge_place (
    source_id, source_record_id, place_kind, name, subtype, street_address, locality,
    latitude, longitude, accessibility_level, accessibility_description,
    accessibility_rating, source_payload
)
SELECT s.source_id, b.property_id, 'building',
       coalesce(nullif(b.building_name, ''), b.street_address),
       nullif(b.predominant_space_use, ''), nullif(b.street_address, ''),
       nullif(b.clue_small_area, ''), b.latitude::double precision,
       b.longitude::double precision, nullif(b.accessibility_type, ''),
       nullif(b.accessibility_type_description, ''),
       nullif(b.accessibility_rating, '')::numeric,
       jsonb_build_object('property_id', b.property_id)
FROM building_import b
JOIN data_source s ON s.source_code = 'com_buildings';

CREATE TEMP TABLE landmark_import (
    theme TEXT, sub_theme TEXT, feature_name TEXT, coordinates TEXT, latitude TEXT, longitude TEXT
);

COPY landmark_import FROM '/datasets/landmarks_refuge_candidates.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO refuge_place (
    source_id, source_record_id, place_kind, name, subtype, description,
    latitude, longitude, source_payload
)
SELECT s.source_id,
       md5(concat_ws('|', l.feature_name, l.latitude, l.longitude)),
       'landmark', l.feature_name, nullif(l.sub_theme, ''), nullif(l.theme, ''),
       l.latitude::double precision, l.longitude::double precision,
       jsonb_build_object('coordinates', l.coordinates)
FROM landmark_import l
JOIN data_source s ON s.source_code = 'com_landmarks';

CREATE TEMP TABLE furniture_import (
    gis_id TEXT, description TEXT, asset_class TEXT, asset_type TEXT, model_no TEXT,
    model_description TEXT, division TEXT, company TEXT, location_description TEXT,
    condition_rating TEXT, evaluation_date TEXT, easting TEXT, northing TEXT,
    upload_date TEXT, coordinate_location TEXT, latitude TEXT, longitude TEXT,
    condition_category TEXT
);

COPY furniture_import FROM '/datasets/street_furniture_clean.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO refuge_place (
    source_id, source_record_id, place_kind, name, subtype, description,
    street_address, latitude, longitude, condition_rating, condition_category,
    observed_on, source_updated_on, source_payload
)
SELECT s.source_id, f.gis_id, 'street_furniture',
       coalesce(nullif(f.description, ''), 'Street furniture ' || f.gis_id),
       nullif(f.asset_type, ''), nullif(f.model_description, ''),
       nullif(f.location_description, ''), f.latitude::double precision,
       f.longitude::double precision, nullif(f.condition_rating, '')::numeric,
       nullif(f.condition_category, ''), nullif(f.evaluation_date, '')::date,
       nullif(f.upload_date, '')::date,
       jsonb_strip_nulls(jsonb_build_object(
           'asset_class', nullif(f.asset_class, ''), 'model_no', nullif(f.model_no, ''),
           'division', nullif(f.division, ''), 'company', nullif(f.company, ''),
           'easting', nullif(f.easting, ''), 'northing', nullif(f.northing, '')
       ))
FROM furniture_import f
JOIN data_source s ON s.source_code = 'com_street_furniture';

UPDATE data_source
SET last_checked_at = now(), last_success_at = now()
WHERE source_code IN ('com_buildings', 'com_landmarks', 'com_street_furniture');

COMMIT;
