INSERT INTO report_category (category_code, display_name, filter_group, default_ttl)
VALUES ('other', 'Other sensory issue', 'other', interval '2 hours')
ON CONFLICT (category_code) DO NOTHING;
