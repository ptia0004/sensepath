"""Train and evaluate the SensePath street-furniture condition model.

This module deliberately calls the target *condition rating*. Converting that
output into an assistive risk indicator happens in the API and is clearly
labelled; the dataset does not contain ground-truth pedestrian sensory stress.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, KFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


FEATURE_COLUMNS = ["ASSET_CLASS", "ASSET_TYPE", "lat", "lon"]
CATEGORICAL_COLUMNS = ["ASSET_CLASS", "ASSET_TYPE"]
TARGET_COLUMN = "CONDITION_RATING"
RANDOM_STATE = 42


def build_pipeline() -> Pipeline:
    preprocessing = ColumnTransformer(
        [
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_COLUMNS,
            )
        ],
        remainder="passthrough",
        verbose_feature_names_out=False,
    )
    return Pipeline(
        [
            ("preprocessing", preprocessing),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=200,
                    max_depth=10,
                    min_samples_leaf=2,
                    random_state=RANDOM_STATE,
                    # n_jobs=1 avoids a Windows joblib temp-path failure for
                    # user profiles containing non-ASCII characters.
                    n_jobs=1,
                ),
            ),
        ]
    )


def regression_metrics(actual, predicted) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted, squared=False)),
        "r2": float(r2_score(actual, predicted)),
    }


def summarise_cv(result: dict) -> dict[str, object]:
    return {
        "mae_mean": float(-result["test_mae"].mean()),
        "rmse_mean": float(-result["test_rmse"].mean()),
        "r2_mean": float(result["test_r2"].mean()),
        "r2_by_fold": [float(value) for value in result["test_r2"]],
    }


def subgroup_metrics(test_frame: pd.DataFrame, actual, predicted) -> dict:
    evaluated = test_frame[["ASSET_TYPE"]].copy()
    evaluated["actual"] = np.asarray(actual)
    evaluated["predicted"] = np.asarray(predicted)
    results = {}
    for asset_type, group in evaluated.groupby("ASSET_TYPE"):
        if len(group) < 5:
            continue
        results[str(asset_type)] = {
            "samples": int(len(group)),
            "mae": float(mean_absolute_error(group["actual"], group["predicted"])),
            "rmse": float(
                mean_squared_error(
                    group["actual"], group["predicted"], squared=False
                )
            ),
        }
    return results


def train_sensory_model(
    dataset_path: str | Path = "datasets/processed_sensory_features.csv",
    model_output_dir: str | Path = "models",
) -> dict:
    dataset_path = Path(dataset_path)
    output_dir = Path(model_output_dir)
    if not dataset_path.is_file():
        raise FileNotFoundError(
            f"Dataset not found at '{dataset_path}'. Run preprocess.py first."
        )

    frame = pd.read_csv(dataset_path)
    required = set(FEATURE_COLUMNS + [TARGET_COLUMN])
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Training dataset is missing: {', '.join(missing)}")

    frame = frame.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN]).copy()
    if len(frame) < 100:
        raise ValueError("At least 100 valid rows are required for evaluation.")

    features = frame[FEATURE_COLUMNS]
    target = frame[TARGET_COLUMN]
    train_x, test_x, train_y, test_y = train_test_split(
        features, target, test_size=0.2, random_state=RANDOM_STATE
    )

    pipeline = build_pipeline()
    pipeline.fit(train_x, train_y)
    predictions = pipeline.predict(test_x)

    baseline = DummyRegressor(strategy="mean")
    baseline.fit(train_x, train_y)
    baseline_predictions = baseline.predict(test_x)

    scoring = {
        "mae": "neg_mean_absolute_error",
        "rmse": "neg_root_mean_squared_error",
        "r2": "r2",
    }
    random_cv = cross_validate(
        build_pipeline(),
        features,
        target,
        cv=KFold(5, shuffle=True, random_state=RANDOM_STATE),
        scoring=scoring,
        n_jobs=1,
    )

    # Nearby assets can be highly correlated. Holding out 0.01-degree grid cells
    # gives a more honest estimate for predictions in unseen Melbourne areas.
    spatial_groups = (
        np.floor(frame["lat"] * 100).astype(str)
        + "_"
        + np.floor(frame["lon"] * 100).astype(str)
    )
    spatial_cv = cross_validate(
        build_pipeline(),
        features,
        target,
        groups=spatial_groups,
        cv=GroupKFold(5),
        scoring=scoring,
        n_jobs=1,
    )

    feature_names = pipeline.named_steps["preprocessing"].get_feature_names_out()
    importances = pipeline.named_steps["model"].feature_importances_
    feature_importance = sorted(
        (
            {"feature": str(name), "importance": float(importance)}
            for name, importance in zip(feature_names, importances)
        ),
        key=lambda item: item["importance"],
        reverse=True,
    )

    evaluation = {
        "model_name": "RandomForestRegressor",
        "model_version": "2.0.0",
        "target": TARGET_COLUMN,
        "target_interpretation": "Street-furniture condition from 1 (poor) to 5 (good)",
        "not_valid_for": [
            "live pedestrian crowd prediction",
            "noise prediction",
            "clinical or personal safety decisions",
        ],
        "data": {
            "rows": int(len(frame)),
            "asset_type_distribution": {
                str(key): int(value)
                for key, value in frame["ASSET_TYPE"].value_counts().items()
            },
            "condition_category_distribution": {
                str(key): int(value)
                for key, value in frame["CONDITION_CATEGORY"].value_counts().items()
            },
        },
        "holdout": regression_metrics(test_y, predictions),
        "baseline_holdout": regression_metrics(test_y, baseline_predictions),
        "random_5_fold_cv": summarise_cv(random_cv),
        "spatial_5_fold_cv": summarise_cv(spatial_cv),
        "subgroup_holdout": subgroup_metrics(test_x, test_y, predictions),
        "feature_importance": feature_importance,
        "limitations": [
            "Asset types are imbalanced; seats dominate the training data.",
            "Spatial validation is the preferred estimate for unseen locations.",
            "Condition rating is not a ground-truth sensory-stress label.",
        ],
    }

    artifact = {
        "pipeline": pipeline,
        "model_version": evaluation["model_version"],
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "target": TARGET_COLUMN,
        "metrics": evaluation,
        "input_schema": {
            "asset_classes": sorted(frame["ASSET_CLASS"].astype(str).unique().tolist()),
            "asset_types": sorted(frame["ASSET_TYPE"].astype(str).unique().tolist()),
            "latitude_range": [float(frame["lat"].min()), float(frame["lat"].max())],
            "longitude_range": [float(frame["lon"].min()), float(frame["lon"].max())],
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "sensory_risk_model.pkl"
    report_path = output_dir / "evaluation_report.json"
    joblib.dump(artifact, model_path)
    report_path.write_text(json.dumps(evaluation, indent=2), encoding="utf-8")

    print(f"Loaded {len(frame)} training records from '{dataset_path}'")
    print("Holdout metrics:")
    print(f"  MAE:  {evaluation['holdout']['mae']:.4f}")
    print(f"  RMSE: {evaluation['holdout']['rmse']:.4f}")
    print(f"  R2:   {evaluation['holdout']['r2']:.4f}")
    print(f"Spatial CV R2: {evaluation['spatial_5_fold_cv']['r2_mean']:.4f}")
    print(f"Model saved to: '{model_path}'")
    print(f"Evaluation evidence saved to: '{report_path}'")
    return evaluation


if __name__ == "__main__":
    train_sensory_model()
