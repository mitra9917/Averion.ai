import pytest

from app.ai.prompt_builder import _compact_chunk_text, build_rag_prompt
from app.core.config import settings


def test_single_passage_keeps_comparison_evidence(monkeypatch):
    monkeypatch.setattr(settings, "rag_prompt_max_context_chars", 4500)
    monkeypatch.setattr(settings, "rag_prompt_max_chunk_chars", 2000)
    text = "intro " * 120 + "Essential comparison evidence in the middle." + " ending" * 120
    assert len(text) < 2000
    prompt = build_rag_prompt("Which idea should I prefer?", [{"text": text}])
    assert "Essential comparison evidence in the middle." in prompt


def test_many_sources_share_total_budget_without_dropping_last_sources(monkeypatch):
    monkeypatch.setattr(settings, "rag_prompt_max_context_chars", 4500)
    monkeypatch.setattr(settings, "rag_prompt_max_chunk_chars", 2000)
    prompt = build_rag_prompt("Compare the ideas", [{"text": str(i) * 3000} for i in range(1, 6)])
    for i in range(1, 6):
        assert f"[Source {i}]" in prompt
    context = prompt.split("Context:\n", 1)[1].split("\nQuestion:", 1)[0]
    passages = [p.split("\n", 1)[1].strip() for p in context.strip().split("\n\n")]
    assert sum(map(len, passages)) <= 4500


@pytest.mark.parametrize("limit", [0, 1, 5, 7, 20, 100])
def test_compaction_always_honors_its_limit(limit):
    assert len(_compact_chunk_text("long passage " * 100, limit)) <= limit
