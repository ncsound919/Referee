from __future__ import annotations

import json
from typing import Protocol, runtime_checkable

from .provenance import ManifestSnapshot


class EngineNotRegistered(RuntimeError):
    """Raised when an engine has no approved, tested adapter implementation."""


@runtime_checkable
class EngineAdapter(Protocol):
    name: str

    def validate(self, snapshot: ManifestSnapshot, workspace: str) -> None:
        """Validate this exact persisted snapshot and its input schemas."""
        ...

    def run(self, snapshot: ManifestSnapshot, workspace: str) -> list[dict[str, str]]:
        """Execute from the serialized snapshot and return validated output refs."""
        ...


class EngineRegistry:
    def __init__(self) -> None:
        self._adapters: dict[str, EngineAdapter] = {}

    def register(self, adapter: EngineAdapter) -> None:
        if adapter.name in self._adapters:
            raise ValueError(f"An adapter is already registered for {adapter.name!r}")
        self._adapters[adapter.name] = adapter

    def require(self, name: str) -> EngineAdapter:
        try:
            return self._adapters[name]
        except KeyError as exc:
            raise EngineNotRegistered(
                f"No validated adapter is registered for {name!r}. "
                "No simulation was run and no biological results were generated."
            ) from exc

    def require_for_snapshot(self, snapshot: ManifestSnapshot) -> EngineAdapter:
        """Select the adapter from the persisted manifest, not a mutable model."""
        try:
            engine_name = json.loads(snapshot.canonical_json)["engine"]["name"]
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise ValueError("Snapshot does not contain a valid engine name") from exc
        return self.require(engine_name)
