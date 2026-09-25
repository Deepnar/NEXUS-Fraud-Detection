import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))

from nexus_ml.evaluation import threshold_for_high_recall
from nexus_ml.transaction_features import (
    TRANSACTION_FEATURE_NAMES,
    clean_transaction_frame,
    transaction_feature_frame,
    transaction_features,
)


class TransactionFeatureTests(unittest.TestCase):
    def test_single_row_inference_frame(self):
        row = pd.Series({
            "Amount": "$134.09",
            "Time": "06:21",
            "Year": 2002,
            "Month": 9,
            "Day": 1,
            "Zip": "91750",
            "MCC": 5300,
            "Use Chip": "Online Transaction",
            "Merchant State": "Italy",
            "Errors?": "Bad CVV",
        })
        feats = transaction_features(row)
        self.assertEqual(set(feats.keys()), set(TRANSACTION_FEATURE_NAMES))
        self.assertEqual(feats["IsOnline"], 1.0)
        self.assertEqual(feats["StateRisky"], 1.0)
        self.assertEqual(feats["HasError"], 1.0)
        self.assertGreater(feats["Amount"], 0)

    def test_batch_frame_fixed_columns(self):
        df = pd.DataFrame([
            {"Amount": "$10", "Time": "01:00", "Year": 2010, "Month": 1, "Day": 1,
             "Zip": "12345", "MCC": 5411, "Use Chip": "Swipe Transaction",
             "Merchant State": "CA", "Errors?": None},
            {"Amount": "$500", "Time": "23:15", "Year": 2016, "Month": 6, "Day": 15,
             "Zip": None, "MCC": 4829, "Use Chip": "Online Transaction",
             "Merchant State": "MISSING", "Errors?": "Bad PIN"},
        ])
        frame = transaction_feature_frame(df)
        self.assertEqual(list(frame.columns), TRANSACTION_FEATURE_NAMES)
        self.assertEqual(frame.shape[0], 2)
        self.assertTrue(all(str(d) == "float64" for d in frame.dtypes))

    def test_high_recall_threshold_helper(self):
        op = threshold_for_high_recall([0, 0, 0, 1, 1, 1], [0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
        self.assertIn("threshold", op)
        self.assertIn("recall", op)
        self.assertGreaterEqual(op["recall"], 0.8)


if __name__ == "__main__":
    unittest.main()
