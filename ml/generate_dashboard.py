from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dashboard.png"


def latest_metrics(task: str) -> dict:
    candidates = sorted((ROOT / "ml" / "artifacts" / task).glob("*/metrics.json"))
    if not candidates:
        raise FileNotFoundError(f"No metrics found for task: {task}")
    return json.loads(candidates[-1].read_text(encoding="utf-8"))


def accuracy(metrics: dict) -> float:
    matrix = np.asarray(metrics["confusion_matrix"], dtype=float)
    return float((matrix[0, 0] + matrix[1, 1]) / matrix.sum())


def card(ax, x: float, title: str, value: str, subtitle: str, color: str) -> None:
    patch = FancyBboxPatch(
        (x, 0.65), 0.22, 0.25,
        boxstyle="round,pad=0.012,rounding_size=0.018",
        linewidth=0, facecolor="#162033", transform=ax.transAxes,
    )
    ax.add_patch(patch)
    ax.text(x + 0.02, 0.875, title.upper(), color="#8fa0b8", fontsize=7, weight="bold", transform=ax.transAxes, va="top")
    ax.text(x + 0.02, 0.815, value, color=color, fontsize=17, weight="bold", transform=ax.transAxes, va="top")
    ax.text(x + 0.02, 0.70, subtitle, color="#aab7ca", fontsize=7, transform=ax.transAxes, va="top")


def main() -> None:
    message = latest_metrics("message")
    url = latest_metrics("url")
    message_test = message["test"]
    baseline_test = message["baseline_logistic"]["test"]
    url_test = url["test"]

    plt.rcParams.update({"font.family": "DejaVu Sans", "axes.titleweight": "bold"})
    fig = plt.figure(figsize=(15, 9), dpi=160, facecolor="#0b1220")
    grid = fig.add_gridspec(100, 100, left=0.045, right=0.965, top=0.94, bottom=0.08, hspace=0.0, wspace=0.0)
    header = fig.add_subplot(grid[:25, :])
    header.set_facecolor("#0b1220")
    header.axis("off")
    header.text(0.0, 0.82, "NEXUS MODEL PERFORMANCE", color="#f2f6fb", fontsize=23, weight="bold")
    header.text(0.0, 0.60, "Fraud detection training dashboard", color="#9aaac0", fontsize=11)
    header.text(0.0, 0.34, "Measured on held-out grouped test partitions · threshold = 0.50", color="#71829a", fontsize=8.5)
    card(header, 0.46, "Accuracy", f"{accuracy(message_test) * 100:.2f}%", "XGBoost · held-out test", "#57d6a2")
    card(header, 0.71, "PR-AUC", f"{message_test['pr_auc'] * 100:.2f}%", "primary fraud metric", "#55b8ff")

    chart = fig.add_subplot(grid[30:76, :60])
    chart.set_facecolor("#111a2b")
    labels = ["Accuracy", "Precision", "Recall", "F1", "PR-AUC", "ROC-AUC"]
    x = np.arange(len(labels))
    width = 0.24
    values = {
        "XGBoost": [accuracy(message_test), message_test["precision"], message_test["recall"], message_test["f1"], message_test["pr_auc"], message_test["roc_auc"]],
        "Logistic baseline": [accuracy(baseline_test), baseline_test["precision"], baseline_test["recall"], baseline_test["f1"], baseline_test["pr_auc"], baseline_test["roc_auc"]],
    }
    colors = ["#57d6a2", "#5cb9ff"]
    for offset, (name, vals) in enumerate(values.items()):
        bars = chart.bar(x + (offset - 0.5) * width, vals, width, label=name, color=colors[offset], alpha=0.92)
        chart.bar_label(bars, fmt="%.3f", padding=3, fontsize=7, color="#dce6f5")
    chart.set_ylim(0, 1.13)
    chart.set_xticks(x, labels, color="#b9c7d9", fontsize=8)
    chart.set_yticks(np.linspace(0, 1, 6), ["0", "20%", "40%", "60%", "80%", "100%"], color="#7f90a8", fontsize=8)
    chart.grid(axis="y", color="#2a3950", linewidth=0.7, alpha=0.7)
    chart.set_axisbelow(True)
    chart.set_title("Message model vs. logistic baseline  ·  green = XGBoost  ·  blue = logistic", loc="left", color="#eef4fb", fontsize=11, pad=16)
    for spine in chart.spines.values():
        spine.set_visible(False)

    side = fig.add_subplot(grid[30:76, 65:])
    side.set_facecolor("#111a2b")
    side.axis("off")
    side.text(0.04, 0.92, "TEST SET SNAPSHOT", color="#eef4fb", fontsize=12, weight="bold")
    side.text(0.04, 0.84, f"Messages: {message['rows']:,} rows", color="#a9b8ca", fontsize=9)
    side.text(0.04, 0.79, f"URL samples: {url['rows']:,} rows", color="#a9b8ca", fontsize=9)
    side.text(0.04, 0.68, "URL benchmark", color="#eef4fb", fontsize=10, weight="bold")
    side.text(0.04, 0.61, f"Accuracy   {accuracy(url_test) * 100:.2f}%", color="#57d6a2", fontsize=10)
    side.text(0.04, 0.55, f"PR-AUC     {url_test['pr_auc'] * 100:.2f}%", color="#55b8ff", fontsize=10)
    side.text(0.04, 0.49, f"ROC-AUC    {url_test['roc_auc'] * 100:.2f}%", color="#55b8ff", fontsize=10)
    side.text(0.04, 0.36, "Interpretation", color="#f2c36b", fontsize=10, weight="bold", va="top")
    side.text(0.04, 0.27, "URL scores are near-perfect on this\nbenchmark and require fresh, time-separated\nexternal validation before production use.", color="#c4cfdd", fontsize=8.5, linespacing=1.45, va="top")

    footer = fig.add_subplot(grid[82:, :])
    footer.set_facecolor("#0b1220")
    footer.axis("off")
    footer.text(0.0, 0.70, "Why PR-AUC matters", color="#eef4fb", fontsize=10, weight="bold")
    footer.text(0.0, 0.25, "Fraud datasets are often imbalanced; PR-AUC and recall reveal missed fraud and review workload better than accuracy alone.", color="#9aaac0", fontsize=8.5)
    fig.savefig(OUTPUT, facecolor=fig.get_facecolor(), bbox_inches="tight")
    print(OUTPUT)


if __name__ == "__main__":
    main()
