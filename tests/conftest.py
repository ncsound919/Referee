"""Test-suite environment.

The referee-core service fails closed when ``REFEREE_API_KEY`` is unset: it
answers 503 rather than serving an unauthenticated deterministic engine. That
is the behaviour we want in every deployment, but the test suite exercises the
API in-process without a key, so it opts out explicitly here.

This must stay in sync with ``referee_core.api._IS_PRODUCTION``, which is
computed at import time - conftest runs before the test modules import the
application, so the override takes effect.
"""
from __future__ import annotations

import os

os.environ["REFEREE_ENV"] = "development"
os.environ.pop("REFEREE_API_KEY", None)
