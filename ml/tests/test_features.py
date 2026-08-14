import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))

from nexus_ml.features import message_features, message_feature_frame, url_feature_frame


class FeatureTests(unittest.TestCase):
    def test_message_features_are_deterministic_and_detect_signals(self):
        text = "URGENT: share your OTP now and pay the fee at https://bit.ly/test"
        first = message_features(text)
        second = message_features(text)
        self.assertEqual(first, second)
        self.assertGreater(first["urgency_terms"], 0)
        self.assertGreater(first["credential_terms"], 0)
        self.assertEqual(first["url_count"], 1)

    def test_message_frame_has_stable_numeric_columns(self):
        frame = message_feature_frame(pd.Series(["hello", "send OTP"]))
        self.assertEqual(frame.shape, (2, 15))
        self.assertTrue(all(str(dtype) == "float64" for dtype in frame.dtypes))

    def test_url_features_ignore_text_columns(self):
        source = pd.DataFrame({"URL": ["https://example.com"] * 10, "Domain": ["example.com"] * 10, "label": [1] * 10, "URLLength": [19] * 10, "Title": ["Example"] * 10})
        features, names = url_feature_frame(source)
        self.assertIn("URLLength", names)
        self.assertNotIn("Title", names)
        self.assertEqual(features.shape[0], 10)


if __name__ == "__main__":
    unittest.main()
