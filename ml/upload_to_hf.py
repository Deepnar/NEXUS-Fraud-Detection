"""Upload the served NEXUS heads to Hugging Face.

Artifacts are git-ignored, so this script (not CI) publishes them:
  1. stages the LATEST ml/artifacts/<task>/*/ dir per head
  2. writes the model card, creates the repo, uploads the folder

Auth: needs a WRITE token. Run it yourself (never paste the token to chat):

    cd /home/deepnar/Programs/nexus
    HF_TOKEN=hf_... .venv/bin/python ml/upload_to_hf.py --repo Deepnar/NEXUS-Fraud-Models

Requires: pip install huggingface_hub (already in ml/requirements.txt).
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "ml" / "artifacts"
HEADS = ["transaction", "message-tfidf", "message", "url"]

MODEL_CARD = """---
library_name: xgboost
tags:
- fraud-detection
- phishing
- xgboost
- nexus
license: mit
---

# NEXUS Fraud Detection — model artifacts

Trained heads for [NEXUS Fraud Detection](https://github.com/Deepnar/NEXUS-Fraud-Detection)
(forked from [Rishit1769/NEXUS-Fraud-Detection](https://github.com/Rishit1769/NEXUS-Fraud-Detection)).
Each folder is a drop-in `ml/artifacts/<task>/<version>/` directory: copy it into the
repo's `ml/artifacts/` (or point `MODEL_ARTIFACT_ROOT` at this repo) and the
FastAPI model service (`ml/service.py`) picks it up with no code changes.

| Head | Folder | Model | Unseen-data result |
|---|---|---|---|
| Transaction fraud (XGBoost + isotonic, Optuna-tuned) | `transaction/` | `model.json` + `calibration_model.joblib` | Fresh-seed PR-AUC 0.689; future-years slice 0.847 |
| Message phishing (TF-IDF char+word + lexical, XGB) | `message-tfidf/` | `model.json` + `vectorizer.joblib` | 18/18 hand-crafted probes |
| Message count baseline (XGB, fallback) | `message/` | `model.json` | advisory-only fallback |
| URL phishing (lexical XGB) | `url/` | `model.json` | 19/20 probes |

`eval_unseen.json` is the full unseen-data ledger. Per-head `metrics.json`,
`thresholds.json` (recall>=0.80 operating points), `feature_manifest.json`,
`split_manifest.json`, and `training_manifest.json` document provenance.

**Note:** deterministic rules stay authoritative in NEXUS — these heads are
advisory and never override a critical rule. Transaction data is synthetic
(IBM); retrain on real adjudicated cases before production use.
"""


def stage(staging: Path) -> Path:
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    for head in HEADS:
        cands = sorted((ART / head).glob("*/model.json"))
        if not cands:
            print(f"skip {head}: no artifact")
            continue
        latest = cands[-1].parent
        dest = staging / head
        shutil.copytree(latest, dest)
        print(f"staged {head}: {latest.name}")
    ledgers = sorted(ART.glob("eval_unseen_*.json"))
    if ledgers:
        shutil.copy(ledgers[-1], staging / "eval_unseen.json")
        print(f"staged ledger: {ledgers[-1].name}")
    (staging / "README.md").write_text(MODEL_CARD, encoding="utf-8")
    return staging


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish NEXUS heads to Hugging Face")
    parser.add_argument("--repo", default="Deepnar/NEXUS-Fraud-Models")
    parser.add_argument("--staging", default="/tmp/nexus-hf-staging")
    args = parser.parse_args()

    from huggingface_hub import HfApi

    staging = stage(Path(args.staging))
    api = HfApi()
    api.create_repo(args.repo, repo_type="model", exist_ok=True)
    print("repo ready:", args.repo)
    info = api.upload_folder(repo_id=args.repo, folder_path=str(staging), repo_type="model")
    print("uploaded:", info)
    print(f"https://huggingface.co/{args.repo}")


if __name__ == "__main__":
    main()
