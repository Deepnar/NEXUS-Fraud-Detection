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
    # Direction features: term counts cannot tell "share your OTP"
    # (attacker asking -> phish) from "your OTP is 482913" (your own
    # notification -> benign). These separate the two directions.
    "share_request_terms",
    "code_receipt_terms",
    "no_share_advice_terms",
]

TERM_GROUPS = {
    "urgency_terms": r"urgent|immediately|suspend|blocked|expire|act now|last warning",
    "credential_terms": r"otp|one[- ]time password|password|pin|cvv|card number|login",
    "payment_terms": r"pay|payment|transfer|refund|fee|bank|upi|wallet|crypto",
    "impersonation_terms": r"bank|government|police|income tax|support|amazon|microsoft|hdfc|sbi",
    "secrecy_terms": r"secret|do not tell|don't tell|confidential|keep this",
    "reward_terms": r"won|winner|prize|reward|lottery|gift|cashback|free",
    "attachment_terms": r"apk|exe|zip|attachment|install|download|document",
    "share_request_terms": r"share (your|the|this|my|an?)?\s*(otp|password|pin|cvv|code|card|details|number)|send (me|us)?\s*(your|the)?\s*(otp|password|pin|cvv|code)|tell me your|provide your|need your otp|require your otp",
    "code_receipt_terms": r"(your|the) (otp|code|password) is \d|otp.{0,25}\d{4,8}|verification code.{0,25}\d{4,8}|code is \d{4,8}",
    "no_share_advice_terms": r"do not share|don't share|never share|never ask|will never ask|beware|stay alert|report.*fraud",
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


URL_LEXICAL_FEATURE_NAMES = [
    "lex_url_length",
    "lex_host_length",
    "lex_path_ratio",
    "lex_query_ratio",
    "lex_has_ip_host",
    "lex_has_punycode",
    "lex_dot_density",
    "lex_hyphen_density",
    "lex_digit_density_host",
    "lex_at_count",
    "lex_percent_count",
    "lex_has_https",
    "lex_subdomain_count",
    "lex_uses_shortener",
    "lex_has_query",
]

_SHORTENER_RE = re.compile(
    r"(bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|adf\.ly|bitly)",
    re.IGNORECASE,
)


def url_lexical_frame(urls: pd.Series) -> pd.DataFrame:
    """Raw-URL-only features: computable at inference from the URL string alone.

    This is what the served `url` head is trained on. Page-level PhiUSIIL
    numerics (URLSimilarityIndex, etc.) are training-time enrichment only and
    can never be supplied for an arbitrary pasted link.
    """
    cleaned = urls.fillna("").astype(str)
    parsed = cleaned.map(urlparse)
    hosts = parsed.map(lambda item: item.hostname or "").astype(str)
    paths = parsed.map(lambda item: item.path or "").astype(str)
    queries = parsed.map(lambda item: item.query or "").astype(str)
    url_len = cleaned.map(len).astype(float).replace(0, 1.0)
    host_len = hosts.map(len).astype(float).replace(0, 1.0)
    frame = pd.DataFrame({
        "lex_url_length": cleaned.map(len).astype(float),
        "lex_host_length": hosts.map(len).astype(float),
        # Ratios, not raw lengths: raw path/query length is a dataset
        # artifact (PhiUSIIL benign rows never have paths). Ratios keep
        # shape signal without "any path = phish".
        "lex_path_ratio": paths.map(len).astype(float) / url_len,
        "lex_query_ratio": queries.map(len).astype(float) / url_len,
        "lex_has_ip_host": hosts.map(
            lambda h: float(bool(re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", h)))
        ),
        "lex_has_punycode": hosts.map(lambda h: float("xn--" in h.lower())),
        "lex_dot_density": cleaned.map(lambda u: float(u.count("."))) / url_len,
        "lex_hyphen_density": cleaned.map(lambda u: float(u.count("-"))) / host_len,
        "lex_digit_density_host": hosts.map(lambda h: float(sum(c.isdigit() for c in h))) / host_len,
        "lex_at_count": cleaned.map(lambda u: float(u.count("@"))),
        "lex_percent_count": cleaned.map(lambda u: float(u.count("%"))),
        "lex_has_https": cleaned.map(lambda u: float(u.lower().startswith("https"))),
        "lex_subdomain_count": hosts.map(
            lambda h: float(max(0, len([p for p in h.split(".") if p]) - 2))
        ),
        "lex_uses_shortener": cleaned.map(lambda u: float(bool(_SHORTENER_RE.search(u)))),
        "lex_has_query": queries.map(lambda q: float(len(q) > 0)),
    })
    return frame[URL_LEXICAL_FEATURE_NAMES].fillna(0.0).astype("float64")


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
