"""Train the NEXUS transaction fraud head (best-method).

Method (NOT Person1 LogReg/shallow-RF baseline):
  - Person2 XGBoost Tuning4 winner as starting point
    (n_estimators=200, max_depth=6, lr=0.1, subsample=0.9, colsample_bytree=0.9)
  - Optuna search over depth/lr/sampling/regularization/scale_pos_weight
  - Isotonic calibration fit on validation only
  - Operating thresholds for HIGH RECALL (recall>=0.80, max precision) plus
    max-F1 comparison; PR-AUC is the selection metric

Artifact layout matches ml/train.py so ml/service.py can serve it:
  ml/artifacts/transaction/<UTC-ts>/{model.json, metrics.json,
    feature_manifest.json, feature_defaults.json, split_manifest.json,
    training_manifest.json, calibration.json, thresholds.json}

Usage:
  python ml/train_transaction.py --n-sample 1000000 --trials 20
  python ml/train_transaction.py --n-sample 200000 --trials 3   # smoke
"""
from __future__ import annotations

import argparse
import json
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import yaml
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score
from xgboost import XGBClassifier

from nexus_ml.evaluation import evaluate_binary, threshold_for_high_recall
from nexus_ml.splitting import grouped_stratified_indices
from nexus_ml.transaction_data import RANDOM_STATE, load_transaction_data

# Person2 Tuning4 winner (validated 1M: val PR-AUC 0.702, test 0.770).
BEST_DEFAULTS: dict[str, Any] = {
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.1,
    "subsample": 0.9,
    "colsample_bytree": 0.9,
    "min_child_weight": 3,
    "reg_alpha": 0.2,
    "reg_lambda": 2.0,
    "tree_method": "hist",
}


def _objective(trial: Any, x_tr: np.ndarray, y_tr: np.ndarray, x_v: np.ndarray, y_v: np.ndarray, seed: int) -> float:
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 200, 600),
        "max_depth": trial.suggest_int("max_depth", 3, 8),
        "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.15, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
        "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 1.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 0.5, 5.0),
        "scale_pos_weight": trial.suggest_categorical("scale_pos_weight", [1, 10, 50, 100, 300]),
        "tree_method": "hist",
    }
    clf = XGBClassifier(
        objective="binary:logistic", eval_metric="aucpr",
        random_state=seed, n_jobs=-1, **params,
    )
    clf.fit(x_tr, y_tr, eval_set=[(x_v, y_v)], verbose=False)
    return float(average_precision_score(y_v, clf.predict_proba(x_v)[:, 1]))


def train(n_sample: int, trials: int, config_path: Path, cache_dir: Path | None) -> Path:
    import optuna

    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    seed: int = int(config.get("seed", RANDOM_STATE))
    root = config_path.parent.parent.resolve()

    features, labels, groups = load_transaction_data(n_sample, seed, cache_dir)
    indices = grouped_stratified_indices(labels.to_numpy(), groups.to_numpy(), seed)
    train_idx, val_idx, test_idx = indices["train"], indices["validation"], indices["test"]
    if min(len(train_idx), len(val_idx), len(test_idx)) == 0:
        raise RuntimeError("Grouped split produced an empty partition")

    x_tr, y_tr = features.iloc[train_idx].to_numpy(), labels.iloc[train_idx].to_numpy()
    x_v, y_v = features.iloc[val_idx].to_numpy(), labels.iloc[val_idx].to_numpy()
    x_te, y_te = features.iloc[test_idx].to_numpy(), labels.iloc[test_idx].to_numpy()

    if trials > 0:
        study = optuna.create_study(direction="maximize")
        study.optimize(lambda t: _objective(t, x_tr, y_tr, x_v, y_v, seed), n_trials=trials)
        best_params: dict[str, Any] = dict(study.best_params)
        best_params["tree_method"] = "hist"
        best_val_pr_auc = float(study.best_value)
    else:
        best_params = dict(BEST_DEFAULTS)
        probe = XGBClassifier(
            objective="binary:logistic", eval_metric="aucpr",
            random_state=seed, n_jobs=-1, **best_params,
        )
        probe.fit(x_tr, y_tr, eval_set=[(x_v, y_v)], verbose=False)
        best_val_pr_auc = float(average_precision_score(y_v, probe.predict_proba(x_v)[:, 1]))

    model = XGBClassifier(
        objective="binary:logistic", eval_metric="aucpr",
        random_state=seed, n_jobs=-1, **best_params,
    )
    model.fit(
        np.vstack([x_tr, x_v]), np.concatenate([y_tr, y_v]),
        eval_set=[(x_v, y_v)], verbose=False,
    )
    # Isotonic calibration fit on validation only (val probs -> calibrated).
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(model.predict_proba(x_v)[:, 1], y_v)
    p_test = iso.predict(model.predict_proba(x_te)[:, 1])
    p_test_raw = model.predict_proba(x_te)[:, 1]
    op = threshold_for_high_recall(y_te, p_test, min_recall=0.80)

    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = root / config["output_dir"] / "transaction" / version
    output.mkdir(parents=True, exist_ok=True)
    model.save_model(output / "model.json")

    metrics = {
        "task": "transaction",
        "method": "xgboost-optuna-isotonic (Person2 Tuning4 family)",
        "rows": len(features),
        "n_sample_requested": n_sample,
        "trials": trials,
        "best_params": best_params,
        "best_val_pr_auc": best_val_pr_auc,
        "class_balance": {str(int(v)): int((labels == v).sum()) for v in sorted(labels.unique())},
        "test_calibrated": evaluate_binary(y_te, p_test),
        "test_raw": evaluate_binary(y_te, p_test_raw),
        "operating_recall80": op,
    }
    (output / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (output / "feature_manifest.json").write_text(
        json.dumps(
            {"feature_version": "transaction-features-1", "columns": list(features.columns),
             "dtypes": {n: str(v) for n, v in features.dtypes.items()}}, indent=2,
        ), encoding="utf-8",
    )
    (output / "feature_defaults.json").write_text(
        json.dumps({n: float(v) for n, v in features.median(numeric_only=True).items()}, indent=2),
        encoding="utf-8",
    )
    (output / "split_manifest.json").write_text(
        json.dumps({"strategy": "grouped_stratified", "groups": "User-Card",
                    "sizes": {n: len(v) for n, v in indices.items()}}, indent=2),
        encoding="utf-8",
    )
    (output / "training_manifest.json").write_text(
        json.dumps({"task": "transaction", "created_at": version,
                    "python": platform.python_version(), "platform": platform.platform(),
                    "config": config, "best_params": best_params}, indent=2, default=str),
        encoding="utf-8",
    )
    (output / "calibration.json").write_text(
        json.dumps({"method": "isotonic", "fit_on": "validation", "calibrated": True,
                    "X_min": [float(v) for v in iso.X_thresholds_[:1]],
                    "n_thresholds": len(iso.X_thresholds_)}, indent=2),
        encoding="utf-8",
    )
    import joblib as _joblib

    _joblib.dump(iso, output / "calibration_model.joblib")
    (output / "thresholds.json").write_text(json.dumps(op, indent=2), encoding="utf-8")
    print(json.dumps({"artifact": str(output), "metrics": metrics}, indent=2))
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NEXUS transaction head (best-method XGB)")
    parser.add_argument("--n-sample", type=int, default=1_000_000)
    parser.add_argument("--trials", type=int, default=20)
    parser.add_argument("--config", type=Path, default=Path("ml/config.yaml"))
    parser.add_argument("--cache-dir", type=Path, default=Path("ml/.txn-cache"))
    args = parser.parse_args()
    train(args.n_sample, args.trials, args.config, args.cache_dir)


if __name__ == "__main__":
    main()
