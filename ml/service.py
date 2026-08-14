from __future__ import annotations

import hmac
import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from xgboost import XGBClassifier

from nexus_ml.features import message_feature_frame, url_feature_frame


ROOT = Path(__file__).resolve().parent
ARTIFACT_ROOT = Path(os.getenv("MODEL_ARTIFACT_ROOT", str(ROOT / "artifacts")))
API_SECRET = os.getenv("MODEL_API_SECRET", "")


class PredictRequest(BaseModel):
    requestId: str = Field(min_length=1, max_length=200)
    text: str = Field(default="", max_length=100_000)
    urls: list[str] = Field(default_factory=list, max_length=20)
    urlFeatures: list[dict[str, float]] | None = None


class FeatureContribution(BaseModel):
    name: str
    value: float
    importance: float
    direction: str


class Prediction(BaseModel):
    task: str
    modelVersion: str
    featureVersion: str
    probability: float
    calibrated: bool
    riskLevel: str
    topFeatures: list[FeatureContribution]


class PredictResponse(BaseModel):
    requestId: str
    message: Prediction | None
    urls: list[Prediction]


app = FastAPI(title="NEXUS Model API", version="1.0.0")


def _check_secret(api_key: str | None) -> None:
    if API_SECRET and not api_key:
        raise HTTPException(status_code=401, detail="Missing model API key")
    if API_SECRET and not hmac.compare_digest(api_key or "", API_SECRET):
        raise HTTPException(status_code=401, detail="Invalid model API key")


def _latest_artifact(task: str) -> Path | None:
    candidates = sorted((ARTIFACT_ROOT / task).glob("*/model.json"))
    return candidates[-1].parent if candidates else None


def _load_model(task: str) -> tuple[XGBClassifier, dict[str, Any], dict[str, float], Path] | None:
    artifact = _latest_artifact(task)
    if artifact is None:
        return None
    model = XGBClassifier()
    model.load_model(artifact / "model.json")
    manifest = json.loads((artifact / "feature_manifest.json").read_text(encoding="utf-8"))
    defaults_path = artifact / "feature_defaults.json"
    defaults = json.loads(defaults_path.read_text(encoding="utf-8")) if defaults_path.exists() else {}
    return model, manifest, defaults, artifact


def _risk_level(probability: float) -> str:
    if probability >= 0.95:
        return "CRITICAL"
    if probability >= 0.80:
        return "HIGH"
    if probability >= 0.50:
        return "MEDIUM"
    return "LOW"


def _predict(task: str, frame: pd.DataFrame) -> Prediction | None:
    loaded = _load_model(task)
    if loaded is None:
        return None
    model, manifest, defaults, artifact = loaded
    columns = list(manifest["columns"])
    for column in columns:
        if column not in frame.columns:
            frame[column] = defaults.get(column, 0.0)
    frame = frame[columns].fillna(0.0).astype("float64")
    probability = float(model.predict_proba(frame)[0, 1])
    importances = getattr(model, "feature_importances_", [])
    ranked = sorted(zip(columns, frame.iloc[0].tolist(), importances), key=lambda item: item[2], reverse=True)[:8]
    top_features = [
        FeatureContribution(
            name=name,
            value=float(value),
            importance=float(importance),
            direction="unknown",
        )
        for name, value, importance in ranked
        if float(importance) > 0
    ]
    return Prediction(
        task=task,
        modelVersion=f"xgboost-{task}-{artifact.name}",
        featureVersion=str(manifest["feature_version"]),
        probability=probability,
        calibrated=False,
        riskLevel=_risk_level(probability),
        topFeatures=top_features,
    )


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "nexus-model-api",
        "messageModel": _latest_artifact("message") is not None,
        "urlModel": _latest_artifact("url") is not None,
    }


@app.post("/v1/predict", response_model=PredictResponse)
def predict(payload: PredictRequest, x_model_api_key: str | None = Header(default=None)) -> PredictResponse:
    _check_secret(x_model_api_key)
    message = None
    if payload.text.strip():
        message = _predict("message", message_feature_frame(pd.Series([payload.text])))

    url_predictions: list[Prediction] = []
    for index, url in enumerate(payload.urls):
        # The trained URL benchmark includes page-level features. Do not make
        # a production URL claim from a raw URL with those fields missing.
        supplied_features = payload.urlFeatures[index] if payload.urlFeatures and index < len(payload.urlFeatures) else None
        url_artifact = _load_model("url")
        required_url_features = {
            name
            for name in (url_artifact[1]["columns"] if url_artifact else [])
            if not name.startswith("derived_")
        }
        if supplied_features is None or not required_url_features.issubset(supplied_features):
            continue
        frame, _ = url_feature_frame(pd.DataFrame({"URL": [url], **{key: [value] for key, value in supplied_features.items()}}))
        prediction = _predict("url", frame)
        if prediction is not None:
            url_predictions.append(prediction)

    return PredictResponse(requestId=payload.requestId, message=message, urls=url_predictions)
