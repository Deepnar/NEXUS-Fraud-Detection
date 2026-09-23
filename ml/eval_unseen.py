"""Unseen-data evaluation for all three NEXUS heads.

Runs from the nexus directory alone: PYTHONPATH=ml .venv/bin/python ml/eval_unseen.py

1. Transaction: fresh-seed 200k sample (seed=123, never used in training) +
   time-split slice (Year>=2015 as future-unseen proxy), scored with the
   latest ml/artifacts/transaction model + isotonic calibration.
2. URL + message: hand-crafted probes (patterns NOT in training sets).

Writes ml/artifacts/eval_unseen_<ts>.json and prints a summary.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from xgboost import XGBClassifier

from nexus_ml.evaluation import evaluate_binary, threshold_for_high_recall
from nexus_ml.features import message_feature_frame, url_lexical_frame
from nexus_ml.transaction_data import RANDOM_STATE, join_aux, main_csv, stratified_sample
from nexus_ml.transaction_features import clean_transaction_frame, transaction_feature_frame

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "ml" / "artifacts"


def _latest(task: str) -> Path:
    cands = sorted((ART / task).glob("*/model.json"))
    if not cands:
        raise RuntimeError(f"no artifact for task {task}")
    return cands[-1].parent


def _load_xgb(task: str):
    d = _latest(task)
    clf = XGBClassifier()
    clf.load_model(d / "model.json")
    manifest = json.loads((d / "feature_manifest.json").read_text())
    defaults = {}
    dp = d / "feature_defaults.json"
    if dp.exists():
        defaults = json.loads(dp.read_text())
    return clf, manifest, defaults, d


def eval_transaction_fresh(n: int = 200_000, seed: int = 123) -> dict:
    sample = stratified_sample(n, seed)
    for col in ["User", "Card"]:
        sample[col] = pd.to_numeric(sample[col], errors="coerce").fillna(-1).astype(int)
    years = pd.to_numeric(sample["Year"], errors="coerce")
    sample = join_aux(sample)
    cleaned = clean_transaction_frame(sample)
    y = (sample["Is Fraud?"] == "Yes").astype(int).to_numpy()
    clf, manifest, defaults, d = _load_xgb("transaction")
    cols = list(manifest["columns"])
    frame = transaction_feature_frame(cleaned)
    for c in cols:
        if c not in frame.columns:
            frame[c] = defaults.get(c, 0.0)
    x = frame[cols].fillna(0.0).astype("float64").to_numpy()
    p_raw = clf.predict_proba(x)[:, 1]
    cal_p = d / "calibration_model.joblib"
    p_cal = joblib.load(cal_p).predict(p_raw) if cal_p.exists() else p_raw

    out = {
        "artifact": d.name,
        "n": n,
        "seed": seed,
        "fraud": int(y.sum()),
        "raw": evaluate_binary(y, p_raw),
        "calibrated": evaluate_binary(y, p_cal),
        "op_recall80_raw": threshold_for_high_recall(y, p_raw, 0.80),
    }
    # Time-split: future years as unseen proxy (artifact trained on all years).
    mask = (years.to_numpy() >= 2015).astype(bool)
    if mask.sum() > 0 and y[mask].sum() > 0:
        out["future_2015+"] = {
            "n": int(mask.sum()),
            "fraud": int(y[mask].sum()),
            "raw": evaluate_binary(y[mask], p_raw[mask]),
            "calibrated": evaluate_binary(y[mask], p_cal[mask]),
        }
    return out


URL_PROBES: list[tuple[str, int]] = [
    ("http://192.168.1.1/verify-login", 1),
    ("http://10.0.0.5/secure/update", 1),
    ("https://hdfc-bank-verify.tk/login", 1),
    ("https://xn--sbi-bank.com/login", 1),
    ("https://amaz0n-gift-winner.ml/claim-prize", 1),
    ("http://bit.ly/3xK9mQ2", 1),
    ("https://support-microsoft.tk/verify?user=admin@x", 1),
    ("https://login form.ga/secure@phish.com", 1),
    ("https://paytm-kyc-update%bank.com", 1),
    ("http://sbi--online.surge.sh/login", 1),
    ("https://income-tax-refund-goi.ml/claim", 1),
    ("https://flipkart-big-billion-day.ga/winner", 1),
    ("https://www.google.com/search?q=hello", 0),
    ("https://github.com/anomalyco/opencode", 0),
    ("https://www.hdfcbank.com/personal/payments", 0),
    ("https://en.wikipedia.org/wiki/Phishing", 0),
    ("https://www.amazon.in/gp/your-account/order-history", 0),
    ("https://stackoverflow.com/questions/12345", 0),
    ("https://www.rbi.org.in/Scripts/FAQView.aspx", 0),
    ("https://mail.google.com/mail/u/0/#inbox", 0),
]

MSG_PROBES: list[tuple[str, int]] = [
    ("URGENT: Your HDFC account will be BLOCKED in 2 hours. Share your OTP now to verify: http://bit.ly/3xK9", 1),
    ("Dear customer your SBI netbanking password expired. Login immediately at https://sbi-verify.tk to avoid suspension", 1),
    ("Congratulations! You won a Rs.50000 Flipkart gift voucher. Claim FREE prize now, pay Rs.99 delivery fee", 1),
    ("Income Tax Dept: you have a refund of Rs.18,450. Share bank details + OTP confidentially to process", 1),
    ("Your parcel is held at customs. Pay Rs.250 fee via UPI and share screenshot, do not tell anyone", 1),
    ("Hi mom this is my new number, I lost my phone. Please transfer Rs.20000 urgently, keep it secret", 1),
    ("KYC expired! Your Paytm wallet will be suspended today. Install this APK to verify: http://tiny.cc/kyc", 1),
    ("Bank manager here, share the OTP you just received to stop the fraudulent transaction immediately", 1),
    ("Part-time job offer: earn Rs.5000/day from home, pay Rs.500 registration fee first via crypto wallet", 1),
    ("Your electricity bill is overdue, connection cut tonight. Call now and share card number for payment", 1),
    ("Hey, are we still on for lunch tomorrow? Let me know what time works for you", 0),
    ("Your OTP for Swiggy login is 482913. Do not share it with anyone.", 0),
    ("Meeting moved to 3pm in conference room B. Agenda attached in the calendar invite.", 0),
    ("Happy birthday! Hope you have a wonderful day. Dinner at our place on Sunday?", 0),
    ("Your Amazon order #402-1234567 has shipped and will arrive Thursday. Track in the app.", 0),
    ("Reminder: dentist appointment tomorrow at 10am. Reply YES to confirm.", 0),
    ("The bill for dinner was Rs.2400, your share is Rs.800. UPI me when free, no rush.", 0),
    ("Photos from the trek are uploaded, check the shared album when you get time!", 0),
]


def eval_probe_head(task: str, texts: list[str]) -> list[float]:
    import joblib as _joblib

    if task == "message-tfidf":
        cands = sorted((ART / "message-tfidf").glob("*/model.json"))
        if not cands:
            raise RuntimeError("no artifact for task message-tfidf")
        d = cands[-1].parent
        clf = XGBClassifier()
        clf.load_model(d / "model.json")
        vecs = _joblib.load(d / "vectorizer.joblib")
        from nexus_ml.message_tfidf import transform as tfidf_transform

        x = tfidf_transform(vecs["char"], vecs["word"], pd.Series(texts))
        return [float(v) for v in clf.predict_proba(x)[:, 1]]
    clf, manifest, defaults, _ = _load_xgb(task)
    cols = list(manifest["columns"])
    if task == "url":
        frame = url_lexical_frame(pd.Series(texts))
    else:
        frame = message_feature_frame(pd.Series(texts))
    for c in cols:
        if c not in frame.columns:
            frame[c] = defaults.get(c, 0.0)
    x = frame[cols].fillna(0.0).astype("float64").to_numpy()
    return [float(v) for v in clf.predict_proba(x)[:, 1]]


def main() -> None:
    report: dict = {"created_at": datetime.now(timezone.utc).isoformat()}
    print("== transaction: fresh-seed 200k (seed=123) ==", flush=True)
    report["transaction_fresh"] = eval_transaction_fresh()
    t = report["transaction_fresh"]
    print(f"fresh raw P/R/F1={t['raw']['precision']:.3f}/{t['raw']['recall']:.3f}/{t['raw']['f1']:.3f} "
          f"PR-AUC={t['raw']['pr_auc']:.3f} (fraud={t['fraud']})", flush=True)
    if "future_2015+" in t:
        f = t["future_2015+"]
        print(f"future2015+ raw P/R/F1={f['raw']['precision']:.3f}/{f['raw']['recall']:.3f}/{f['raw']['f1']:.3f} "
              f"PR-AUC={f['raw']['pr_auc']:.3f} (n={f['n']} fraud={f['fraud']})", flush=True)

    print("== url probes (20 unseen) ==", flush=True)
    url_probs = eval_probe_head("url", [u for u, _ in URL_PROBES])
    url_rows = []
    for (u, y), p in zip(URL_PROBES, url_probs):
        ok = (p >= 0.5) == bool(y)
        url_rows.append({"url": u, "expected": y, "p": round(p, 4), "correct": ok})
        print(f"{'OK ' if ok else 'MISS'} p={p:.3f} exp={y} {u}", flush=True)
    report["url_probes"] = url_rows

    print("== message probes (18 unseen, TF-IDF served head) ==", flush=True)
    msg_probs = eval_probe_head("message-tfidf", [m for m, _ in MSG_PROBES])
    msg_rows = []
    for (m, y), p in zip(MSG_PROBES, msg_probs):
        ok = (p >= 0.5) == bool(y)
        msg_rows.append({"text": m[:80], "expected": y, "p": round(p, 4), "correct": ok})
        print(f"{'OK ' if ok else 'MISS'} p={p:.3f} exp={y} {m[:80]}", flush=True)
    report["message_probes"] = msg_rows

    out = ART / f"eval_unseen_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"wrote {out}", flush=True)


if __name__ == "__main__":
    main()
