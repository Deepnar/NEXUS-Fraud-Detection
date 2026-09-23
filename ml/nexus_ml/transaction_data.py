"""Transaction data loading (NEXUS format).

Ported from iis_mini common_txn.py + train_unified_quick.py sampling.
Same loader signature as nexus_ml.data (features, labels, groups) so
ml/train_transaction.py and ml/service.py can share the split contract.

Best-method context: Person2 1M XGBoost (PR-AUC 0.77) beats Person1 RF
(PR-AUC 0.62); this loader preserves the 0.122% natural fraud ratio with
uniform stratified sampling and joins aux card/user tables for
CreditLimit / CardOnDarkWeb / FICO.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd

from .transaction_features import clean_transaction_frame, transaction_feature_frame

TARGET_COL = "Is Fraud?"
RANDOM_STATE = 42
KAGGLE_SLUG = "ealtman2019/credit-card-transactions"
MAIN_CSV = "credit_card_transactions-ibm_v2.csv"


def dataset_dir() -> str:
    import kagglehub

    return kagglehub.dataset_download(KAGGLE_SLUG)


def main_csv() -> str:
    return os.path.join(dataset_dir(), MAIN_CSV)


def _read_cards() -> pd.DataFrame | None:
    try:
        df = pd.read_csv(os.path.join(dataset_dir(), "sd254_cards.csv"))
        if "Credit Limit" in df.columns:
            df["CreditLimit"] = pd.to_numeric(
                df["Credit Limit"].astype(str).str.replace(r"[\$,]", "", regex=True),
                errors="coerce",
            )
        if "Card on Dark Web" in df.columns:
            df["CardOnDarkWeb"] = (
                df["Card on Dark Web"].astype(str).str.lower() == "yes"
            ).astype(int)
        return df
    except Exception:
        return None


def _read_users() -> pd.DataFrame | None:
    try:
        return pd.read_csv(os.path.join(dataset_dir(), "sd254_users.csv"))
    except Exception:
        return None


def join_aux(sample: pd.DataFrame) -> pd.DataFrame:
    """Best-effort left join of card/user aux attributes."""
    sample = sample.copy()
    for col in ["User", "Card"]:
        if col in sample.columns:
            sample[col] = pd.to_numeric(sample[col], errors="coerce")
    cards = _read_cards()
    if cards is not None and {"User", "Card"}.issubset(sample.columns):
        small = cards[["User", "CARD INDEX", "CreditLimit", "CardOnDarkWeb"]].copy()
        small["User"] = pd.to_numeric(small["User"], errors="coerce")
        small["CARD INDEX"] = pd.to_numeric(small["CARD INDEX"], errors="coerce")
        sample = sample.merge(
            small, left_on=["User", "Card"], right_on=["User", "CARD INDEX"], how="left"
        ).drop(columns=["CARD INDEX"], errors="ignore")
    # NOTE: sd254_users.Person holds names, not numeric User ids, so no
    # users join here; FICO defaults are applied in clean_transaction_frame.
    return sample


def stratified_sample(n: int, seed: int = RANDOM_STATE) -> pd.DataFrame:
    """Uniform stratified sample preserving the ~0.122% fraud ratio (streaming)."""
    src = main_csv()
    n_total, n_fraud = 0, 0
    for chunk in pd.read_csv(src, usecols=[TARGET_COL], chunksize=500_000):
        n_total += len(chunk)
        n_fraud += int((chunk[TARGET_COL] == "Yes").sum())
    ratio = n_fraud / n_total
    n_fraud_s = int(round(ratio * n))
    n_legit_s = n - n_fraud_s
    rng = np.random.default_rng(seed)
    fraud_keep = sorted(rng.choice(n_fraud, n_fraud_s, replace=False).tolist())
    legit_keep = sorted(rng.choice(n_total - n_fraud, n_legit_s, replace=False).tolist())
    parts: list[pd.DataFrame] = []
    cf = cl = fi = li = 0
    for chunk in pd.read_csv(src, chunksize=200_000, dtype=str):
        is_fraud = (chunk[TARGET_COL] == "Yes").to_numpy()
        f_pos = np.flatnonzero(is_fraud)
        l_pos = np.flatnonzero(~is_fraud)
        take: list[int] = []
        while fi < len(fraud_keep) and fraud_keep[fi] < cf + len(f_pos):
            take.append(int(f_pos[fraud_keep[fi] - cf]))
            fi += 1
        while li < len(legit_keep) and legit_keep[li] < cl + len(l_pos):
            take.append(int(l_pos[legit_keep[li] - cl]))
            li += 1
        if take:
            parts.append(chunk.iloc[take])
        cf += len(f_pos)
        cl += len(l_pos)
    sample = pd.concat(parts, ignore_index=True).sample(frac=1, random_state=seed).reset_index(drop=True)
    return sample


def load_transaction_data(
    n_sample: int = 1_000_000,
    seed: int = RANDOM_STATE,
    cache_dir: Path | None = None,
) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """Load (or reuse cached) transaction sample -> (features, labels, groups).

    Groups are per-card (User-Card) so grouped splits never leak a card
    across train/val/test.
    """
    cache_path: Path | None = None
    if cache_dir is not None:
        cache_path = Path(cache_dir) / f"transactions_{n_sample}_{seed}.parquet"
        if cache_path.exists():
            sample = pd.read_parquet(cache_path)
            labels = (sample[TARGET_COL] == "Yes").astype(int)
            features = transaction_feature_frame(sample)
            groups = (
                sample["User"].astype(str) + "-" + sample["Card"].astype(str)
            )
            return features, labels.reset_index(drop=True), groups.reset_index(drop=True)

    sample = stratified_sample(n_sample, seed)
    for col in ["User", "Card"]:
        sample[col] = pd.to_numeric(sample[col], errors="coerce").fillna(-1).astype(int)
    sample = join_aux(sample)
    cleaned = clean_transaction_frame(sample)
    labels = (sample[TARGET_COL] == "Yes").astype(int)
    features = transaction_feature_frame(cleaned)
    groups = sample["User"].astype(str) + "-" + sample["Card"].astype(str)

    if cache_path is not None:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        sample.to_parquet(cache_path, index=False)
    return features, labels.reset_index(drop=True), groups.reset_index(drop=True)
