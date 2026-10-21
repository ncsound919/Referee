import json
from pathlib import Path

from referee_core.audit import canonical

VECTORS = json.loads(Path(__file__).with_name("canonical_vectors.json").read_text())


def test_canonical_vectors():
    for v in VECTORS:
        got = canonical(v["input"])
        assert got == v["expected"], (v["name"], got, v["expected"])