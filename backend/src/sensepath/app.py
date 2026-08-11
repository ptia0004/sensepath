"""SensePath model and refuge-location API."""

from __future__ import annotations

import math
import os
import hmac
from pathlib import Path
from time import perf_counter
from typing import Any

import joblib
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from .report_store import ReportNotFoundError, ReportValidationError, create_report_store


# backend/src/sensepath/app.py -> repository root is parents[3]
BASE_DIR = Path(__file__).resolve().parents[3]
# Prefer React production build; fall back to legacy HTML prototype if needed.
_REACT_DIST = BASE_DIR / "frontend" / "dist"
_LEGACY_WEB = BASE_DIR / "frontend-legacy"
WEB_DIR = _REACT_DIST if (_REACT_DIST / "index.html").is_file() else _LEGACY_WEB
DEFAULT_MODEL_PATH = BASE_DIR / "data" / "models" / "sensory_risk_model.pkl"
DEFAULT_REFUGE_PATH = BASE_DIR / "data" / "datasets" / "refuge_locations.csv"
MAX_BATCH_SIZE = 100


class PredictionError(ValueError):
    """An error caused by invalid client input."""


class SensoryRiskPredictor:
    """Load a versioned artifact and provide validated condition predictions."""

    def __init__(self, model_path: Path) -> None:
        if not model_path.is_file():
            raise FileNotFoundError(
                f"Model not found at '{model_path}'. Run 'python backend/scripts/train_model.py' first."
            )
        artifact = joblib.load(model_path)
        if not isinstance(artifact, dict):
            raise RuntimeError("The model artifact has an unsupported format.")

        self.pipeline = artifact.get("pipeline")
        self.legacy_model = artifact.get("model")
        self.legacy_features = artifact.get("feature_names", [])
        if self.pipeline is None and self.legacy_model is None:
            raise RuntimeError("The model artifact contains no deployable model.")
        self.metadata = {
            key: value
            for key, value in artifact.items()
            if key not in {"pipeline", "model"}
        }

    @staticmethod
    def _required_text(payload: dict[str, Any], key: str) -> str:
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            raise PredictionError(f"'{key}' must be a non-empty string.")
        return value.strip()

    @staticmethod
    def _required_number(
        payload: dict[str, Any], key: str, minimum: float, maximum: float
    ) -> float:
        value = payload.get(key)
        if isinstance(value, bool):
            raise PredictionError(f"'{key}' must be a number.")
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise PredictionError(f"'{key}' must be a number.") from exc
        if not math.isfinite(number) or not minimum <= number <= maximum:
            raise PredictionError(f"'{key}' must be between {minimum} and {maximum}.")
        return number

    def predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise PredictionError("Request body must be a JSON object.")

        asset_class = self._required_text(payload, "asset_class")
        asset_type = self._required_text(payload, "asset_type")
        latitude = self._required_number(payload, "latitude", -90.0, 90.0)
        longitude = self._required_number(payload, "longitude", -180.0, 180.0)

        schema = self.metadata.get("input_schema", {})
        allowed_classes = schema.get("asset_classes", [])
        allowed_types = schema.get("asset_types", [])
        if allowed_classes and asset_class not in allowed_classes:
            raise PredictionError(
                f"Unknown 'asset_class'. Allowed values: {', '.join(allowed_classes)}."
            )
        if allowed_types and asset_type not in allowed_types:
            raise PredictionError(
                f"Unknown 'asset_type'. Allowed values: {', '.join(allowed_types)}."
            )

        raw = pd.DataFrame(
            [
                {
                    "ASSET_CLASS": asset_class,
                    "ASSET_TYPE": asset_type,
                    "lat": latitude,
                    "lon": longitude,
                }
            ]
        )
        if self.pipeline is not None:
            condition_score = float(self.pipeline.predict(raw)[0])
        else:
            encoded = pd.get_dummies(
                raw,
                columns=["ASSET_CLASS", "ASSET_TYPE"],
                drop_first=False,
            ).reindex(columns=self.legacy_features, fill_value=0)
            condition_score = float(self.legacy_model.predict(encoded)[0])

        condition_score = max(1.0, min(5.0, condition_score))
        risk_score = (5.0 - condition_score) / 4.0 * 100.0
        condition_category = (
            "Good"
            if condition_score >= 4.0
            else "Average"
            if condition_score >= 2.0
            else "Poor"
        )
        risk_level = "high" if risk_score >= 67 else "medium" if risk_score >= 34 else "low"

        lat_range = schema.get("latitude_range")
        lon_range = schema.get("longitude_range")
        in_training_area = None
        if lat_range and lon_range:
            in_training_area = (
                lat_range[0] <= latitude <= lat_range[1]
                and lon_range[0] <= longitude <= lon_range[1]
            )
        warnings = []
        if in_training_area is False:
            warnings.append("Location is outside the training area; reliability is lower.")

        return {
            "prediction_type": "street_furniture_condition",
            "condition_score": round(condition_score, 3),
            "condition_category": condition_category,
            "assistive_condition_risk_score": round(risk_score, 1),
            "assistive_condition_risk_level": risk_level,
            # Backwards-compatible names for the first API version.
            "sensory_risk_score": round(risk_score, 1),
            "sensory_risk_level": risk_level,
            "in_training_area": in_training_area,
            "model_version": self.metadata.get("model_version", "legacy"),
            "warnings": warnings,
            "disclaimer": (
                "This estimates infrastructure condition, not live crowding, noise, "
                "personal safety, or clinical sensory impact."
            ),
        }


class RefugeCatalog:
    """Query the auditable catalog built from all three open datasets."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.frame = pd.read_csv(path) if path.is_file() else pd.DataFrame()

    @property
    def loaded(self) -> bool:
        return not self.frame.empty

    @staticmethod
    def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6_371_000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        value = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))

    def nearby(self, latitude: float, longitude: float, radius_m: int, limit: int) -> list[dict]:
        if not self.loaded:
            return []
        candidates = self.frame.copy()
        candidates["distance_m"] = [
            self._distance_m(latitude, longitude, row.lat, row.lon)
            for row in candidates.itertuples()
        ]
        candidates = candidates[candidates["distance_m"] <= radius_m].nsmallest(
            limit, "distance_m"
        )
        records = []
        for row in candidates.itertuples():
            records.append(
                {
                    "id": str(row.place_id),
                    "name": str(row.name),
                    "place_kind": str(row.place_kind),
                    "subtype": str(row.subtype),
                    "latitude": float(row.lat),
                    "longitude": float(row.lon),
                    "distance_m": int(round(row.distance_m)),
                    "source_file": str(row.source_file),
                }
            )
        return records


def _query_number(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = request.args.get(name, default)
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise PredictionError(f"'{name}' must be a number.") from exc
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise PredictionError(f"'{name}' must be between {minimum} and {maximum}.")
    return value


def create_app(
    model_path: str | Path | None = None,
    refuge_path: str | Path | None = None,
    database_url: str | None = None,
    moderator_token: str | None = None,
) -> Flask:
    app = Flask(
        __name__,
        static_folder=str(WEB_DIR) if WEB_DIR.is_dir() else None,
        static_url_path="",
    )
    allowed_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "https://ptia0004.github.io,http://127.0.0.1:5000,http://127.0.0.1:5001,http://localhost:5000,http://localhost:5001",
        ).split(",")
        if origin.strip()
    ]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    predictor = SensoryRiskPredictor(
        Path(model_path or os.getenv("SENSEPATH_MODEL_PATH", DEFAULT_MODEL_PATH)).resolve()
    )
    refuges = RefugeCatalog(
        Path(refuge_path or os.getenv("SENSEPATH_REFUGE_PATH", DEFAULT_REFUGE_PATH)).resolve()
    )
    report_store = create_report_store(
        database_url if database_url is not None else os.getenv("DATABASE_URL"),
        BASE_DIR,
    )
    configured_moderator_token = (
        moderator_token if moderator_token is not None else os.getenv("MODERATOR_TOKEN")
    )
    app.config.update(
        PREDICTOR=predictor,
        REFUGE_CATALOG=refuges,
        REPORT_STORE=report_store,
    )

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

    @app.get("/")
    def index():
        return send_from_directory(WEB_DIR, "index.html")

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "model_loaded": True,
                "refuge_catalog_loaded": refuges.loaded,
                "report_store": report_store.backend_name,
                "model_version": predictor.metadata.get("model_version", "legacy"),
            }
        )

    @app.get("/api/model-info")
    def model_info():
        return jsonify(predictor.metadata)

    @app.post("/api/predict")
    def predict():
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json."}), 415
        started = perf_counter()
        try:
            result = predictor.predict(request.get_json(silent=True))
        except PredictionError as exc:
            return jsonify({"error": str(exc)}), 400
        result["latency_ms"] = round((perf_counter() - started) * 1000, 2)
        return jsonify(result)

    @app.post("/api/predict-batch")
    def predict_batch():
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json."}), 415
        body = request.get_json(silent=True)
        items = body.get("items") if isinstance(body, dict) else None
        if not isinstance(items, list) or not items:
            return jsonify({"error": "'items' must be a non-empty array."}), 400
        if len(items) > MAX_BATCH_SIZE:
            return jsonify({"error": f"At most {MAX_BATCH_SIZE} items are allowed."}), 400
        started = perf_counter()
        try:
            predictions = [predictor.predict(item) for item in items]
        except PredictionError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify(
            {
                "count": len(predictions),
                "predictions": predictions,
                "latency_ms": round((perf_counter() - started) * 1000, 2),
            }
        )

    @app.get("/api/refuges")
    def nearby_refuges():
        try:
            latitude = _query_number("latitude", -37.8136, -90, 90)
            longitude = _query_number("longitude", 144.9631, -180, 180)
            radius_m = int(_query_number("radius_m", 1500, 1, 20_000))
            limit = int(_query_number("limit", 20, 1, 50))
        except PredictionError as exc:
            return jsonify({"error": str(exc)}), 400
        results = refuges.nearby(latitude, longitude, radius_m, limit)
        return jsonify({"count": len(results), "refuges": results})

    @app.get("/api/reports")
    def list_reports():
        category = request.args.get("category") or None
        try:
            limit = int(_query_number("limit", 100, 1, 200))
            reports = report_store.list_active(category=category, limit=limit)
        except ReportValidationError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"count": len(reports), "reports": reports})

    @app.post("/api/reports")
    def create_report():
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json."}), 415
        try:
            report, created = report_store.create(request.get_json(silent=True))
        except ReportValidationError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"created": created, "report": report}), 201 if created else 200

    @app.post("/api/reports/<report_id>/moderate")
    def moderate_report(report_id: str):
        if not configured_moderator_token:
            return jsonify({"error": "Moderation is not configured."}), 503
        provided_token = request.headers.get("X-Moderator-Token", "")
        if not hmac.compare_digest(provided_token, configured_moderator_token):
            return jsonify({"error": "Moderator authentication failed."}), 403
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json."}), 415
        body = request.get_json(silent=True)
        try:
            result = report_store.moderate(
                report_id,
                body.get("action") if isinstance(body, dict) else None,
                body.get("reason") if isinstance(body, dict) else None,
            )
        except ReportValidationError as exc:
            return jsonify({"error": str(exc)}), 400
        except ReportNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404
        return jsonify(result)

    @app.get("/<path:asset_path>")
    def frontend_assets(asset_path: str):
        """Serve Vite build assets when Flask hosts the React app."""
        candidate = WEB_DIR / asset_path
        if candidate.is_file():
            return send_from_directory(WEB_DIR, asset_path)
        return send_from_directory(WEB_DIR, "index.html")

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Endpoint not found."}), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
