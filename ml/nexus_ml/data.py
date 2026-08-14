from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

from .features import message_feature_frame, url_feature_frame


def load_url_data(path: Path) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    frame = pd.read_csv(path, encoding_errors="replace")
    if "label" not in frame.columns or "URL" not in frame.columns:
        raise ValueError("URL dataset must contain URL and label columns")
    # PhiUSIIL representative rows establish 0=phishing and 1=benign.
    target = (pd.to_numeric(frame["label"], errors="coerce") == 0).astype(int)
    features, names = url_feature_frame(frame)
    groups = frame.get("Domain", frame["URL"]).fillna("").astype(str).str.lower()
    features.columns = names
    return features, target, groups


def load_message_data(dataset_path: Path, sms_path: Path | None = None) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    frame = pd.read_csv(dataset_path, encoding_errors="replace")
    if not {"LABEL", "TEXT"}.issubset(frame.columns):
        raise ValueError("Message dataset must contain LABEL and TEXT columns")
    texts = frame["TEXT"].fillna("").astype(str).tolist()
    labels = frame["LABEL"].fillna("").astype(str).str.lower().isin({"spam", "smishing", "url"}).astype(int)
    frames = [pd.DataFrame(message_feature_frame(pd.Series(texts)))]
    groups = pd.Series([hashlib.sha256(text.lower().strip().encode()).hexdigest() for text in texts])

    if sms_path and sms_path.exists():
        rows: list[tuple[str, str]] = []
        for line in sms_path.read_text(encoding="utf-8", errors="replace").splitlines():
            label, separator, text = line.partition("\t")
            if separator:
                rows.append((label.lower(), text))
        if rows:
            extra_texts = [text for _, text in rows]
            frames.append(message_feature_frame(pd.Series(extra_texts)))
            labels = pd.concat([labels, pd.Series([int(label == "spam") for label, _ in rows])], ignore_index=True)
            groups = pd.concat(
                [groups, pd.Series([hashlib.sha256(text.lower().strip().encode()).hexdigest() for text in extra_texts])],
                ignore_index=True,
            )

    return pd.concat(frames, ignore_index=True), labels.reset_index(drop=True), groups.reset_index(drop=True)
