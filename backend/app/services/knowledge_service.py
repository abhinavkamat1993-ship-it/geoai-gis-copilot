from typing import Protocol


class KnowledgeService(Protocol):
    """Future retrieval boundary for GIS dictionaries, SOPs, and QA guidance."""

    def retrieve_context(self, query: str) -> list[str]: ...
