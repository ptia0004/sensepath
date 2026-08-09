"""SensePath data validation and feature engineering pipeline.

The pipeline produces two separate, auditable outputs:

* ``processed_sensory_features.csv`` for the street-furniture condition model.
* ``refuge_locations.csv`` combining all three open datasets for the web map.

Keeping these outputs separate avoids pretending that building and landmark rows
have a street-furniture condition label when they do not.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import pandas as pd


MODEL_COLUMNS = [
    "GIS_ID",
    "DESCRIPTION",
    "ASSET_CLASS",
    "ASSET_TYPE",
    "CONDITION_RATING",
    "CONDITION_CATEGORY",
    "lat",
    "lon",
]


def _read_required_csv(path: Path, required: Iterable[str]) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"Required dataset not found: {path}")
    frame = pd.read_csv(path)
    missing = sorted(set(required) - set(frame.columns))
    if missing:
        raise ValueError(f"{path.name} is missing columns: {', '.join(missing)}")
    return frame


def _clean_coordinates(frame: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    cleaned = frame.copy()
    cleaned["lat"] = pd.to_numeric(cleaned["lat"], errors="coerce")
    cleaned["lon"] = pd.to_numeric(cleaned["lon"], errors="coerce")
    valid = cleaned["lat"].between(-90, 90) & cleaned["lon"].between(-180, 180)
    dropped = int((~valid).sum())
    return cleaned.loc[valid].copy(), dropped


def process_street_furniture(path: str | Path) -> tuple[pd.DataFrame, dict]:
    source = Path(path)
    raw = _read_required_csv(source, MODEL_COLUMNS)
    cleaned, invalid_coordinates = _clean_coordinates(raw[MODEL_COLUMNS])
    cleaned["CONDITION_RATING"] = pd.to_numeric(
        cleaned["CONDITION_RATING"], errors="coerce"
    )
    valid_target = cleaned["CONDITION_RATING"].between(1, 5)
    invalid_targets = int((~valid_target).sum())
    cleaned = cleaned.loc[valid_target].copy()
    cleaned["CONDITION_CATEGORY"] = cleaned["CONDITION_CATEGORY"].fillna("Unknown")
    cleaned["type"] = "Street_Furniture"
    cleaned["source_file"] = source.name
    cleaned = cleaned.drop_duplicates(subset=["GIS_ID"], keep="last")

    report = {
        "source_file": source.name,
        "raw_rows": int(len(raw)),
        "clean_rows": int(len(cleaned)),
        "invalid_coordinate_rows": invalid_coordinates,
        "invalid_target_rows": invalid_targets,
        "duplicate_ids_removed": int(len(raw) - invalid_coordinates - invalid_targets - len(cleaned)),
    }
    return cleaned, report


def process_refuge_buildings(path: str | Path) -> tuple[pd.DataFrame, dict]:
    source = Path(path)
    required = [
        "Property ID",
        "Building name",
        "Predominant space use",
        "Accessibility rating",
        "Latitude",
        "Longitude",
    ]
    raw = _read_required_csv(source, required).rename(
        columns={"Latitude": "lat", "Longitude": "lon"}
    )
    cleaned, invalid_coordinates = _clean_coordinates(raw)
    accessibility = pd.to_numeric(
        cleaned["Accessibility rating"], errors="coerce"
    )
    result = pd.DataFrame(
        {
            "place_id": "building-" + cleaned["Property ID"].astype(str),
            "name": cleaned["Building name"].fillna("Unnamed refuge building"),
            "place_kind": "building",
            "subtype": cleaned["Predominant space use"].fillna("Unknown"),
            "accessibility_rating": accessibility,
            "condition_rating": pd.NA,
            "lat": cleaned["lat"],
            "lon": cleaned["lon"],
            "source_file": source.name,
        }
    ).drop_duplicates(subset=["place_id"], keep="last")
    return result, {
        "source_file": source.name,
        "raw_rows": int(len(raw)),
        "clean_rows": int(len(result)),
        "invalid_coordinate_rows": invalid_coordinates,
    }


def process_landmark_candidates(path: str | Path) -> tuple[pd.DataFrame, dict]:
    source = Path(path)
    required = ["Theme", "Sub Theme", "Feature Name", "lat", "lon"]
    raw = _read_required_csv(source, required)
    cleaned, invalid_coordinates = _clean_coordinates(raw)
    ids = cleaned.index.to_series().astype(str)
    result = pd.DataFrame(
        {
            "place_id": "landmark-" + ids,
            "name": cleaned["Feature Name"].fillna("Unnamed landmark"),
            "place_kind": "landmark",
            "subtype": cleaned["Sub Theme"].fillna(cleaned["Theme"]).fillna("Unknown"),
            "accessibility_rating": pd.NA,
            "condition_rating": pd.NA,
            "lat": cleaned["lat"],
            "lon": cleaned["lon"],
            "source_file": source.name,
        }
    ).drop_duplicates(subset=["place_id"], keep="last")
    return result, {
        "source_file": source.name,
        "raw_rows": int(len(raw)),
        "clean_rows": int(len(result)),
        "invalid_coordinate_rows": invalid_coordinates,
    }


def furniture_refuge_catalog(frame: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "place_id": "furniture-" + frame["GIS_ID"].astype(str),
            "name": frame["DESCRIPTION"].fillna(frame["ASSET_TYPE"]),
            "place_kind": "street_furniture",
            "subtype": frame["ASSET_TYPE"],
            "accessibility_rating": pd.NA,
            "condition_rating": frame["CONDITION_RATING"],
            "lat": frame["lat"],
            "lon": frame["lon"],
            "source_file": frame["source_file"],
        }
    )


def run_data_pipeline(dataset_dir: str | Path = "datasets") -> dict:
    dataset_path = Path(dataset_dir)
    print("Running validated SensePath data pipeline...")

    furniture, furniture_report = process_street_furniture(
        dataset_path / "street_furniture_clean.csv"
    )
    buildings, buildings_report = process_refuge_buildings(
        dataset_path / "buildings_refuge_final.csv"
    )
    landmarks, landmarks_report = process_landmark_candidates(
        dataset_path / "landmarks_refuge_candidates.csv"
    )

    model_output = dataset_path / "processed_sensory_features.csv"
    refuge_output = dataset_path / "refuge_locations.csv"
    report_output = dataset_path / "data_quality_report.json"

    furniture.to_csv(model_output, index=False)
    refuge_catalog = pd.concat(
        [buildings, landmarks, furniture_refuge_catalog(furniture)],
        ignore_index=True,
    )
    refuge_catalog.to_csv(refuge_output, index=False)

    report = {
        "datasets": [furniture_report, buildings_report, landmarks_report],
        "outputs": {
            "model_rows": int(len(furniture)),
            "refuge_rows": int(len(refuge_catalog)),
            "model_dataset": str(model_output),
            "refuge_catalog": str(refuge_output),
        },
    }
    report_output.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(
        "Processed records -> "
        f"Furniture: {len(furniture)}, Buildings: {len(buildings)}, "
        f"Landmarks: {len(landmarks)}"
    )
    print(f"Model dataset saved to: '{model_output}'")
    print(f"Three-source refuge catalog saved to: '{refuge_output}'")
    print(f"Data quality evidence saved to: '{report_output}'")
    return report


if __name__ == "__main__":
    run_data_pipeline()
