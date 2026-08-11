"""API tests using Python's built-in unittest framework."""

import unittest
import tempfile
import uuid
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from src.sensepath.app import create_app


class SensePathApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary_directory = tempfile.TemporaryDirectory()
        database_path = Path(cls.temporary_directory.name) / "reports.sqlite3"
        cls.app = create_app(
            database_url=f"sqlite:///{database_path}", moderator_token="test-token"
        )

    @classmethod
    def tearDownClass(cls):
        cls.temporary_directory.cleanup()

    def setUp(self):
        self.app.config.update(TESTING=True)
        self.client = self.app.test_client()

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["model_loaded"])
        self.assertTrue(response.get_json()["refuge_catalog_loaded"])
        self.assertEqual(response.get_json()["report_store"], "sqlite")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_prediction(self):
        response = self.client.post(
            "/api/predict",
            json={
                "asset_class": "Outdoor Furniture",
                "asset_type": "Seat",
                "latitude": -37.8136,
                "longitude": 144.9631,
            },
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(body["condition_score"], 1.0)
        self.assertLessEqual(body["condition_score"], 5.0)
        self.assertIn(body["sensory_risk_level"], {"low", "medium", "high"})
        self.assertEqual(body["prediction_type"], "street_furniture_condition")
        self.assertIn("latency_ms", body)
        self.assertIn("not live crowding", body["disclaimer"])

    def test_missing_field_returns_400(self):
        response = self.client.post(
            "/api/predict",
            json={"asset_class": "Outdoor Furniture"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("asset_type", response.get_json()["error"])

    def test_unknown_asset_type_returns_400(self):
        response = self.client.post(
            "/api/predict",
            json={
                "asset_class": "Outdoor Furniture",
                "asset_type": "Traffic Light",
                "latitude": -37.8136,
                "longitude": 144.9631,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unknown 'asset_type'", response.get_json()["error"])

    def test_non_json_returns_415(self):
        response = self.client.post("/api/predict", data="not json")
        self.assertEqual(response.status_code, 415)

    def test_batch_prediction(self):
        item = {
            "asset_class": "Outdoor Furniture",
            "asset_type": "Seat",
            "latitude": -37.8136,
            "longitude": 144.9631,
        }
        response = self.client.post("/api/predict-batch", json={"items": [item, item]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["count"], 2)

    def test_batch_limit(self):
        response = self.client.post(
            "/api/predict-batch", json={"items": [{} for _ in range(101)]}
        )
        self.assertEqual(response.status_code, 400)

    def test_nearby_refuges_uses_catalog(self):
        response = self.client.get(
            "/api/refuges?latitude=-37.8136&longitude=144.9631&radius_m=1500&limit=5"
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(body["count"], 5)
        self.assertGreater(body["count"], 0)
        distances = [item["distance_m"] for item in body["refuges"]]
        self.assertEqual(distances, sorted(distances))

    def test_invalid_refuge_query_returns_400(self):
        response = self.client.get("/api/refuges?latitude=not-a-number")
        self.assertEqual(response.status_code, 400)

    def test_create_and_list_community_report(self):
        payload = {
            "category": "crowds",
            "latitude": -37.8136,
            "longitude": 144.9631,
            "location_label": "Swanston Street",
            "comment": "Busy footpath near the tram stop",
            "submission_key": str(uuid.uuid4()),
        }
        created = self.client.post("/api/reports", json=payload)
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.get_json()["created"])
        listed = self.client.get("/api/reports?category=crowds")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(
            any(item["id"] == created.get_json()["report"]["id"] for item in listed.get_json()["reports"])
        )

    def test_report_submission_is_idempotent(self):
        key = str(uuid.uuid4())
        payload = {
            "category": "roadworks",
            "latitude": -37.81,
            "longitude": 144.96,
            "submission_key": key,
        }
        first = self.client.post("/api/reports", json=payload)
        second = self.client.post("/api/reports", json=payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.get_json()["created"])
        self.assertEqual(
            first.get_json()["report"]["id"], second.get_json()["report"]["id"]
        )

    def test_report_rejects_script_content(self):
        response = self.client.post(
            "/api/reports",
            json={
                "category": "loud",
                "latitude": -37.81,
                "longitude": 144.96,
                "comment": "<script>alert(1)</script>",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("unsafe", response.get_json()["error"])

    def test_moderation_requires_token_and_hides_report(self):
        created = self.client.post(
            "/api/reports",
            json={
                "category": "crowds",
                "latitude": -37.81,
                "longitude": 144.96,
                "submission_key": str(uuid.uuid4()),
            },
        ).get_json()["report"]
        denied = self.client.post(
            f"/api/reports/{created['id']}/moderate", json={"action": "hide"}
        )
        self.assertEqual(denied.status_code, 403)
        hidden = self.client.post(
            f"/api/reports/{created['id']}/moderate",
            json={"action": "hide", "reason": "Duplicate test report"},
            headers={"X-Moderator-Token": "test-token"},
        )
        self.assertEqual(hidden.status_code, 200)
        listed = self.client.get("/api/reports").get_json()["reports"]
        self.assertFalse(any(item["id"] == created["id"] for item in listed))

    def test_expired_report_is_hidden(self):
        created = self.client.post(
            "/api/reports",
            json={
                "category": "other",
                "latitude": -37.81,
                "longitude": 144.96,
                "submission_key": str(uuid.uuid4()),
            },
        ).get_json()["report"]
        database_path = self.app.config["REPORT_STORE"].path
        expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        with sqlite3.connect(database_path) as connection:
            connection.execute(
                "UPDATE community_report SET expires_at = ? WHERE report_id = ?",
                (expired, created["id"]),
            )
        listed = self.client.get("/api/reports").get_json()["reports"]
        self.assertFalse(any(item["id"] == created["id"] for item in listed))

    def test_frontend_contains_integrated_features(self):
        response = self.client.get("/")
        html = response.get_data(as_text=True)
        # React mount point (production dist) or legacy HTML prototype
        self.assertTrue(
            'id="root"' in html
            or 'id="submit-report-button"' in html
            or 'id="model-predict-button"' in html,
            "Expected React root or legacy SensePath markup",
        )
        # Source tree must include explainable React modules for mentor review
        frontend_src = Path(__file__).resolve().parents[2] / "frontend" / "src"
        for relative in (
            "App.jsx",
            "pages/MapPage.jsx",
            "api/client.js",
            "components/map/SenseMap.jsx",
        ):
            self.assertTrue(
                (frontend_src / relative).is_file(),
                f"Missing React source file: {relative}",
            )
        response.close()


if __name__ == "__main__":
    unittest.main()
