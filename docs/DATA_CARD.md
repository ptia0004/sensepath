# SensePath data card

## Sources and outputs

The preprocessing pipeline validates three project-provided open datasets:

1. `street_furniture_clean.csv`: 3,967 raw rows; used for condition modelling.
2. `buildings_refuge_final.csv`: 33 refuge-building candidates.
3. `landmarks_refuge_candidates.csv`: 72 landmark candidates.

It creates:

- `processed_sensory_features.csv`: 3,966 valid labelled furniture rows.
- `refuge_locations.csv`: 4,071 standardised locations from all three sources.
- `data_quality_report.json`: row counts and rejected-record evidence.

One furniture row with an invalid/missing 1-5 target is rejected. Missing model
targets are never median-imputed, because fabricating labels would bias model
evaluation.

## Governance and limitations

- Source filename is retained on every processed row for provenance.
- Coordinates are converted to numeric values and checked against valid global
  latitude/longitude bounds.
- Duplicated source identifiers are removed deterministically.
- The datasets describe assets and candidate places, not individual users.
- The catalog does not prove that a location is quiet, open, accessible at a
  particular time, or suitable for every sensory-sensitive person.

Before production use, the team should record the original publisher URL,
licence, collection date, refresh schedule, geographic coverage, and data owner
for each source in the Project Governance Portfolio.
