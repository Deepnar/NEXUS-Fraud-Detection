from __future__ import annotations

import re
from urllib.parse import urlparse

import pandas as pd

MESSAGE_FEATURE_NAMES = [
    "message_length",
    "word_count",
    "url_count",
    "email_count",
    "phone_count",
    "digit_count",
    "uppercase_ratio",
    "special_ratio",
    "urgency_terms",
    "credential_terms",
    "payment_terms",
    "impersonation_terms",
    "secrecy_terms",
    "reward_terms",
    "attachment_terms",
]

TERM_GROUPS = {
    "urgency_terms": r"urgent|immediately|suspend|blocked|expire|act now|last warning",
    "credential_terms": r"otp|one[- ]time password|password|pin|cvv|card number|login",
    "payment_terms": r"pay|payment|transfer|refund|fee|bank|upi|wallet|crypto",
    "impersonation_terms": r"bank|government|police|income tax|support|amazon|microsoft|hdfc|sbi",
    "secrecy_terms": r"secret|do not tell|don't tell|confidential|keep this",
    "reward_terms": r"won|winner|prize|reward|lottery|gift|cashback|free",
    "attachment_terms": r"apk|exe|zip|attachment|install|download|document",
}

URL_RE = re.compile(r"https?://[^\s<>'\"]+", re.IGNORECASE)
EMAIL_RE = re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")


def _ratio(numerator: int, denominator: int) -> float:
    return float(numerator) / denominator if denominator else 0.0


def message_features(text: str) -> dict[str, float]:
    text = str(text or "")
    lowered = text.lower()
    letters = [char for char in text if char.isalpha()]
    return {
        "message_length": float(len(text)),
        "word_count": float(len(text.split())),
        "url_count": float(len(URL_RE.findall(text))),
        "email_count": float(len(EMAIL_RE.findall(text))),
        "phone_count": float(len(PHONE_RE.findall(text))),
        "digit_count": float(sum(char.isdigit() for char in text)),
        "uppercase_ratio": _ratio(sum(char.isupper() for char in letters), len(letters)),
        "special_ratio": _ratio(sum(not char.isalnum() and not char.isspace() for char in text), len(text)),
        **{name: float(len(re.findall(pattern, lowered))) for name, pattern in TERM_GROUPS.items()},
    }


def message_feature_frame(texts: pd.Series) -> pd.DataFrame:
    return pd.DataFrame([message_features(value) for value in texts], columns=MESSAGE_FEATURE_NAMES).fillna(0.0)


def _as_number(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def url_feature_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    excluded = {"URL", "Domain", "TLD", "Title", "label"}
    numeric: dict[str, pd.Series] = {}
    for name in frame.columns:
        if name in excluded:
            continue
        converted = _as_number(frame[name])
        if converted.notna().sum() >= max(10, int(len(frame) * 0.8)):
            numeric[name] = converted

    if "URL" in frame.columns:
        urls = frame["URL"].fillna("").astype(str)
        parsed = urls.map(urlparse)
        numeric["derived_host_length"] = parsed.map(lambda item: len(item.hostname or ""))
        numeric["derived_path_length"] = parsed.map(lambda item: len(item.path or ""))
        numeric["derived_query_length"] = parsed.map(lambda item: len(item.query or ""))
        numeric["derived_has_ip_host"] = parsed.map(
            lambda item: float(bool(re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", item.hostname or "")))
        )

    result = pd.DataFrame(numeric).replace([float("inf"), float("-inf")], pd.NA)
    result = result.apply(lambda column: column.fillna(column.median() if column.notna().any() else 0.0))
    result = result.astype("float64")
    return result, list(result.columns)
