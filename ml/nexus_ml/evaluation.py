from __future__ import annotations

from typing import Any

import numpy as np


def _auc(x: np.ndarray, y: np.ndarray) -> float | None:
    order = np.argsort(x)
    x_sorted, y_sorted = x[order], y[order]
    if len(np.unique(y_sorted)) < 2:
        return None
    positives = np.sum(y_sorted == 1)
    negatives = np.sum(y_sorted == 0)
    ranks = np.argsort(np.argsort(x_sorted)) + 1
    return float((np.sum(ranks[y_sorted == 1]) - positives * (positives + 1) / 2) / (positives * negatives))


def _average_precision(y_true: np.ndarray, probabilities: np.ndarray) -> float | None:
    if np.sum(y_true == 1) == 0:
        return None
    order = np.argsort(-probabilities)
    sorted_labels = y_true[order]
    cumulative = np.cumsum(sorted_labels)
    positions = np.arange(1, len(sorted_labels) + 1)
    return float(np.sum((cumulative / positions) * sorted_labels) / np.sum(sorted_labels))


def evaluate_binary(y_true: Any, probabilities: Any, threshold: float = 0.5) -> dict[str, Any]:
    y_true = np.asarray(y_true, dtype=int)
    probabilities = np.asarray(probabilities, dtype=float)
    predictions = (probabilities >= threshold).astype(int)
    true_positive = int(np.sum((y_true == 1) & (predictions == 1)))
    false_positive = int(np.sum((y_true == 0) & (predictions == 1)))
    false_negative = int(np.sum((y_true == 1) & (predictions == 0)))
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    metrics: dict[str, Any] = {
        "threshold": threshold,
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(2 * precision * recall / (precision + recall)) if precision + recall else 0.0,
        "confusion_matrix": [[int(np.sum((y_true == 0) & (predictions == 0))), false_positive], [false_negative, true_positive]],
    }
    metrics["pr_auc"] = _average_precision(y_true, probabilities)
    metrics["roc_auc"] = _auc(probabilities, y_true)
    return metrics


def threshold_for_high_recall(
    y_true: Any, probabilities: Any, min_recall: float = 0.80
) -> dict[str, Any]:
    """Operating threshold: max precision subject to recall >= min_recall.

    Falls back to max-F1 when min_recall is unreachable. Used for the
    high-recall policy (catch scams, minimise false alarms).
    """
    from sklearn.metrics import precision_recall_curve

    y_arr = np.asarray(y_true, dtype=int)
    p_arr = np.asarray(probabilities, dtype=float)
    prec, rec, thr = precision_recall_curve(y_arr, p_arr)
    f1 = 2 * prec * rec / np.maximum(prec + rec, 1e-12)
    best_f1_idx = int(np.argmax(f1))
    candidates = [
        (float(thr[i]), float(prec[i + 1]), float(rec[i + 1]), float(f1[i + 1]))
        for i in range(len(thr))
        if rec[i + 1] >= min_recall
    ]
    if candidates:
        candidates.sort(key=lambda item: item[1], reverse=True)
        threshold, precision, recall, f1_score = candidates[0]
        mode = f"recall>={min_recall}"
    else:
        threshold = float(thr[best_f1_idx - 1]) if best_f1_idx > 0 else 0.5
        precision, recall, f1_score = (
            float(prec[best_f1_idx]),
            float(rec[best_f1_idx]),
            float(f1[best_f1_idx]),
        )
        mode = "max-F1 (min-recall unreachable)"
    return {
        "mode": mode,
        "threshold": threshold,
        "precision": precision,
        "recall": recall,
        "f1": f1_score,
        "max_f1": float(f1[best_f1_idx]),
        "max_f1_threshold": float(thr[best_f1_idx - 1]) if best_f1_idx > 0 else 0.5,
        "pr_auc": _average_precision(y_arr, p_arr),
    }
