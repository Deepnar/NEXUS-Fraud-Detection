import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parents[1]))

from nexus_ml.evaluation import evaluate_binary
from nexus_ml.splitting import grouped_stratified_indices


class TrainingSmokeTests(unittest.TestCase):
    def test_evaluation_returns_required_metrics(self):
        metrics = evaluate_binary([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])
        self.assertIn("precision", metrics)
        self.assertIn("recall", metrics)
        self.assertIn("f1", metrics)
        self.assertIn("pr_auc", metrics)
        self.assertEqual(len(metrics["confusion_matrix"]), 2)

    def test_grouped_split_keeps_duplicate_group_together(self):
        labels = pd.Series([0, 0, 1, 1, 0, 1]).to_numpy()
        groups = pd.Series(["a", "a", "b", "b", "c", "d"]).to_numpy()
        partitions = grouped_stratified_indices(labels, groups)
        locations = {}
        for name, indices in partitions.items():
            for index in indices:
                group = groups[index]
                if group in locations:
                    self.assertEqual(locations[group], name)
                else:
                    locations[group] = name


if __name__ == "__main__":
    unittest.main()
