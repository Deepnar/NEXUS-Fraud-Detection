import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))

from nexus_ml.message_tfidf import build_vectorizers, fit_transform, transform


class TfidfTests(unittest.TestCase):
    def test_featurize_is_deterministic(self):
        texts = pd.Series(["share your OTP now", "your OTP is 482913"])
        c1, w1 = build_vectorizers()
        m1 = fit_transform(c1, w1, texts)
        c2, w2 = build_vectorizers()
        m2 = fit_transform(c2, w2, texts)
        self.assertEqual(m1.shape, m2.shape)
        self.assertEqual((m1 != m2).nnz, 0)

    def test_transform_matches_fit_columns(self):
        texts = pd.Series(["share your OTP now", "your OTP is 482913", "hello world"])
        c, w = build_vectorizers()
        m_fit = fit_transform(c, w, texts)
        m_new = transform(c, w, pd.Series(["share your password urgently"]))
        self.assertEqual(m_fit.shape[1], m_new.shape[1])
        self.assertEqual(m_new.shape[0], 1)


if __name__ == "__main__":
    unittest.main()
