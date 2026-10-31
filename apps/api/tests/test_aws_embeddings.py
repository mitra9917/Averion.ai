import io
import json
from collections import OrderedDict

import pytest

from app.ai import aws_embeddings, embeddings
from app.core.config import settings


class FakeLambda:
    def __init__(self, payload, error=False):
        self.payload = payload
        self.error = error
        self.calls = []
        self.stream = None

    def invoke(self, **kwargs):
        self.calls.append(kwargs)
        self.stream = io.BytesIO(json.dumps(self.payload).encode())
        return {"Payload": self.stream, **({"FunctionError": "Unhandled"} if self.error else {})}


def configure(monkeypatch, payload, error=False):
    client = FakeLambda(payload, error)
    monkeypatch.setattr(aws_embeddings, "lambda_client", lambda: client)
    monkeypatch.setattr(settings, "embedding_provider", "aws_lambda")
    monkeypatch.setattr(settings, "embedding_aws_function_name", "arn:aws:lambda:ap-south-1:856073125851:function:averion-embeddings-prod")
    monkeypatch.setattr(embeddings, "_embedding_cache", OrderedDict())
    return client


def test_remote_embedding_preserves_cache_and_does_not_load_local_model(monkeypatch):
    vector = [0.25] * 384
    client = configure(monkeypatch, {"model": settings.embedding_model_name, "loaded": True, "vectors": [vector]})
    monkeypatch.setattr(embeddings, "get_embedding_model", lambda: pytest.fail("Render loaded local ML"))
    assert embeddings.embed_text(" example ") == vector
    assert embeddings.embed_text("example") == vector
    assert len(client.calls) == 1
    assert json.loads(client.calls[0]["Payload"])["texts"] == ["example"]
    assert client.stream.closed


@pytest.mark.parametrize("vectors", [[[0.1]], [[float("nan")] * 384], []])
def test_rejects_invalid_aws_vectors(monkeypatch, vectors):
    configure(monkeypatch, {"model": settings.embedding_model_name, "loaded": True, "vectors": vectors})
    with pytest.raises(RuntimeError, match="invalid"):
        aws_embeddings.encode_remote(["query"])


def test_remote_failure_does_not_fall_back_to_local_model(monkeypatch):
    client = configure(monkeypatch, {"errorMessage": "private internal failure"}, error=True)
    with pytest.raises(RuntimeError, match="AWS embedding service failed"):
        embeddings.embed_text("query")
    assert client.stream.closed


def test_rejects_model_mismatch(monkeypatch):
    configure(monkeypatch, {"model": "different-model", "loaded": True, "vectors": [[0.1] * 384]})
    with pytest.raises(RuntimeError, match="mismatched"):
        aws_embeddings.encode_remote(["query"])
