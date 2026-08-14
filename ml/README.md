# NEXUS ML Training

This pipeline trains reproducible URL-risk and message-fraud baselines from the downloaded local datasets. It does not invent transaction features because the current Prisma schema contains conversations, messages, URLs, analysis results, and officer outcomes, not financial transactions.

## Setup

From the repository root:

```powershell
python -m venv .venv-ml
.\.venv-ml\Scripts\Activate.ps1
python -m pip install -r ml/requirements.txt
```

The repository's dataset files are intentionally ignored by Git. Place them at the repository root or update `ml/config.yaml`.

## Train

```powershell
python ml/train.py --task url --config ml/config.yaml
python ml/train.py --task message --config ml/config.yaml
```

Artifacts are written to `ml/artifacts/<task>/<version>/` and include the XGBoost model, feature manifest, metrics, split manifest, and training manifest. The output directory is ignored by Git.

## Data boundaries

- `PhiUSIIL_Phishing_URL_Dataset.csv`: URL baseline; label `0` is phishing and `1` is benign, verified against representative rows.
- `verified_online.csv`: PhishTank positive URL candidates; labels are mapped to phishing.
- `top-1m.csv`: Tranco benign-domain candidates; used only as a source for future lexical examples.
- `Dataset_5971.csv`: labeled SMS/message dataset.
- `SMSSpamCollection`: UCI SMS baseline, with `spam` mapped to suspicious and `ham` to benign.

The current Prisma schema has no training-table contract. NEXUS officer outcomes should be exported into the canonical schema described in `docs/model_training.md` after privacy review, then added as a versioned data source.

## Limitations

The first pipeline uses engineered numeric features and does not claim production accuracy. It must be evaluated on time/domain/campaign-separated data, calibrated, compared with the deterministic NEXUS rules, and shadow-deployed before it changes user-facing decisions.
