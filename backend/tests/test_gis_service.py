import pytest
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.intent_parser import parse_intent
from app.gis.queries import count_features, find_features, get_feature_by_id
from app.gis.spatial_analysis import calculate_distance, find_nearby_features, validate_asset_location
from app.models.gis import CopilotQuery, GisIntent
from app.services.copilot_service import answer_query
from app.services.gis_service import execute_intent
from app.gis.validation import validate_intent
from app.api.routes.copilot import router as copilot_router
from app.main import app as api_app


def test_find_asset(repository):
    result = get_feature_by_id(repository, "valves", "VAL-1001")
    assert result["properties"]["asset_id"] == "VAL-1001"


def test_filter_assets(repository):
    active = find_features(repository, "valves", {"status": "Active"})
    assert active
    assert all(item["properties"]["status"] == "Active" for item in active)


def test_nearby_analysis(repository):
    incident = repository.find_by_id("incidents", "INC-2001")
    result = find_nearby_features(repository, "valves", incident, 500)
    assert result
    assert all(distance <= 500 for _, distance in result)


def test_distance_is_projected_meters(repository):
    valve = repository.find_by_id("valves", "VAL-1001")
    pipeline = repository.find_by_id("pipelines", valve["properties"]["pipeline_id"])
    distance = calculate_distance(valve, pipeline)
    assert distance is not None
    assert distance >= 0
    assert distance < 100_000


def test_empty_results_are_success(repository):
    result = execute_intent(repository, GisIntent(type="FILTER_ASSETS", layer="valves", filters={"status": "Not a status"}))
    assert result.success
    assert result.features == []
    assert "0 valves" in result.summary


def test_invalid_asset_id_returns_not_found(repository):
    with pytest.raises(HTTPException) as error:
        execute_intent(repository, GisIntent(type="ASSET_DETAILS", asset_id="VAL-999999"))
    assert error.value.status_code == 404


def test_invalid_layer_rejected(repository):
    with pytest.raises(HTTPException) as error:
        validate_intent(GisIntent(type="FIND_ASSETS", layer="secret_layer"), repository)
    assert error.value.status_code == 422


def test_missing_geometry_not_returned_as_match(repository):
    incident = {"geometry": None, "properties": {"incident_id": "INC-NO-GEOM"}}
    assert calculate_distance(incident, repository.find_by_id("valves", "VAL-1001")) is None


def test_intent_validation_rejects_unsupported_filter(repository):
    with pytest.raises(HTTPException):
        validate_intent(GisIntent(type="FILTER_ASSETS", layer="valves", filters={"password": "x"}), repository)


def test_invalid_distance_range_returns_validation_response(repository):
    result = answer_query(repository, CopilotQuery(message="Find valves within 900 kilometers", selected_location={"latitude": 31.5, "longitude": -102.5}))
    assert result.success is False
    assert "500 kilometers" in result.summary


def test_attribute_validation_finds_documented_issues(repository):
    result = execute_intent(repository, GisIntent(type="ATTRIBUTE_VALIDATION", layer="valves"))
    assert result.success
    assert result.features


def test_valve_pipeline_spatial_validation(repository):
    findings = validate_asset_location(repository, "valves", 25)
    assert findings
    assert any(item.get("distance_m") is not None and item["distance_m"] > 25 for item in findings)


def test_pipeline_specific_spatial_validation(repository):
    findings = validate_asset_location(repository, "valves", 25, "PL-1001")
    assert findings
    assert all(item["feature"]["properties"]["pipeline_id"] == "PL-1001" for item in findings)


def test_copilot_endpoint_service_uses_real_geojson(repository):
    result = answer_query(repository, CopilotQuery(message="Find active valves"))
    assert result.success
    assert result.features
    assert all(feature.attributes["status"] == "Active" for feature in result.features)


def test_parser_requests_clarification_for_incomplete_nearby_query():
    assert parse_intent("Find valves near the station") is None


def test_copilot_http_endpoint(repository):
    app = FastAPI()
    app.state.repository = repository
    app.include_router(copilot_router)
    with TestClient(app) as client:
        response = client.post("/api/copilot/query", json={"message": "Find active valves"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["features"]
    assert payload["trust"]["fact"]


def test_copilot_returns_analysis_buffer_geometry(repository):
    result = answer_query(repository, CopilotQuery(
        message="Find valves within 500 meters",
        selected_location={"latitude": 31.7, "longitude": -102.9},
    ))
    assert result.analysis_geometry
    assert result.analysis_geometry["type"] == "Polygon"
    assert any("analysis buffer" in step for step in result.analysis)


def test_configured_vite_origin_is_allowed():
    with TestClient(api_app) as client:
        response = client.options("/api/copilot/query", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

