from __future__ import annotations

import hashlib
from collections import defaultdict

import numpy as np


def grouped_stratified_indices(labels: np.ndarray, groups: np.ndarray, seed: int = 42) -> dict[str, np.ndarray]:
    """Split by group while preserving approximate label proportions."""
    del seed
    by_label: dict[int, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for index, (label, group) in enumerate(zip(labels, groups)):
        by_label[int(label)][str(group)].append(index)

    result: dict[str, list[int]] = {"train": [], "validation": [], "test": []}
    for label_groups in by_label.values():
        ordered = sorted(label_groups.items(), key=lambda item: hashlib.sha256(item[0].encode()).hexdigest())
        total = sum(len(indices) for _, indices in ordered)
        train_cutoff = total * 0.70
        validation_cutoff = total * 0.85
        assigned = 0
        for group, indices in ordered:
            if assigned < train_cutoff:
                destination = "train"
            elif assigned < validation_cutoff:
                destination = "validation"
            else:
                destination = "test"
            result[destination].extend(indices)
            assigned += len(indices)

    return {name: np.asarray(sorted(indices), dtype=int) for name, indices in result.items()}
