"""Tests for preprocessing evidence and model robustness artifacts."""

import json
import unittest
from pathlib import Path

import pandas as pd

from scripts.preprocess import (
    process_landmark_candidates,
    process_refuge_buildings,
    process_street_furniture,
)
from scripts.train_model import build_pipeline


BASE_DIR = Path(__file__).resolve().parents[1]


class DataPipelineTests(unittest.TestCase):
    def test_all_three_sources_are_valid(self):
        furniture, _ = process_street_furniture(
            BASE_DIR / "datasets" / "street_furniture_clean.csv"
        )
        buildings, _ = process_refuge_buildings(
            BASE_DIR / "datasets" / "buildings_refuge_final.csv"
        )
        landmarks, _ = process_landmark_candidates(
            BASE_DIR / "datasets" / "landmarks_refuge_candidates.csv"
        )
        self.assertGreater(len(furniture), 0)
        self.assertGreater(len(buildings), 0)
        self.assertGreater(len(landmarks), 0)

    def test_data_quality_report_has_three_datasets(self):
        report = json.loads(
            (BASE_DIR / "datasets" / "data_quality_report.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(len(report["datasets"]), 3)
        self.assertGreater(report["outputs"]["refuge_rows"], 0)

    def test_pipeline_handles_unseen_category(self):
        train = pd.DataFrame(
            {
                "ASSET_CLASS": ["Outdoor Furniture"] * 4,
                "ASSET_TYPE": ["Seat", "Seat", "Barbeque", "Barbeque"],
                "lat": [-37.81, -37.82, -37.80, -37.79],
                "lon": [144.96, 144.97, 144.95, 144.94],
            }
        )
        pipeline = build_pipeline().fit(train, [3.0, 4.0, 2.0, 3.0])
        unseen = train.iloc[[0]].assign(ASSET_TYPE="Future Asset Type")
        prediction = pipeline.predict(unseen)
        self.assertEqual(len(prediction), 1)

    def test_evaluation_contains_robustness_and_bias_evidence(self):
        report = json.loads(
            (BASE_DIR / "models" / "evaluation_report.json").read_text(
                encoding="utf-8"
            )
        )
        for key in (
            "baseline_holdout",
            "random_5_fold_cv",
            "spatial_5_fold_cv",
            "subgroup_holdout",
            "feature_importance",
            "limitations",
        ):
            self.assertIn(key, report)


if __name__ == "__main__":
    unittest.main()
