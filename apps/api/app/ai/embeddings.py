import logging
import os
from collections import OrderedDict
from threading import Lock
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL_NAME = settings.embedding_model_name
_model: Any | None = None
_model_error: str | None = None
_embedding_cache: OrderedDict[str, list[float]] = OrderedDict()
_embedding_cache_lock = Lock()
_EMBEDDING_CACHE_SIZE = 2_048


def get_embedding_model() -> Any:
    """
    Lazily load the embedding model.

    Keeping model loading out of module import makes tests and app startup safer.
    The first embedding call may still download/load the model.
    """
    global _model, _model_error

    if _model is None:
        # Keep the local AI stack friendly to laptops with limited memory.
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        os.environ.setdefault("OMP_NUM_THREADS", "2")
        os.environ.setdefault("MKL_NUM_THREADS", "2")

        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model: %s", MODEL_NAME)
        try:
            _model = SentenceTransformer(MODEL_NAME, local_files_only=True)
        except OSError:
            logger.info(
                "Embedding model is not cached; downloading %s",
                MODEL_NAME
            )
            _model = SentenceTransformer(MODEL_NAME)
        _model_error = None

    return _model


def preload_embedding_model() -> bool:
    """Load the embedding model during startup when configured."""
    global _model_error
    try:
        get_embedding_model()
        return True
    except Exception as exc:
        _model_error = type(exc).__name__
        logger.exception("Embedding model preload failed")
        return False


def get_embedding_model_status() -> dict[str, str | bool | None]:
    return {
        "model": MODEL_NAME,
        "loaded": _model is not None,
        "error": _model_error
    }


def embed_text(text: str) -> list[float]:
    """
    Generate embedding for a single text string.
    
    Args:
        text: Input text to embed
        
    Returns:
        List of floats representing the embedding vector
    """
    normalized_text = text.strip()
    with _embedding_cache_lock:
        cached = _embedding_cache.get(normalized_text)
        if cached is not None:
            _embedding_cache.move_to_end(normalized_text)
            return cached.copy()

    embedding = get_embedding_model().encode(normalized_text).tolist()
    _cache_embeddings({normalized_text: embedding})
    return embedding


def _cache_embeddings(embeddings: dict[str, list[float]]) -> None:
    with _embedding_cache_lock:
        for text, embedding in embeddings.items():
            _embedding_cache[text] = embedding
            _embedding_cache.move_to_end(text)
        while len(_embedding_cache) > _EMBEDDING_CACHE_SIZE:
            _embedding_cache.popitem(last=False)


def generate_embeddings(
    chunks: list[dict],
    batch_size: int | None = None
) -> list[dict]:
    """
    Generate embeddings for each document chunk and attach them to the chunk data.
    
    Args:
        chunks: List of chunk dictionaries containing document_id, chunk_index, 
                page_number, and text
                
    Returns:
        Updated list of chunks with embeddings attached
    """
    eligible_chunks = [
        chunk
        for chunk in chunks
        if str(chunk.get("text", "")).strip()
    ]
    failed_count = len(chunks) - len(eligible_chunks)
    
    logger.info(
        "Starting embedding generation for %s chunks using %s",
        len(chunks),
        MODEL_NAME
    )
    
    if not eligible_chunks:
        return chunks

    texts = [str(chunk["text"]).strip() for chunk in eligible_chunks]
    uncached_texts: list[str] = []
    uncached_text_set: set[str] = set()
    embeddings_by_text: dict[str, list[float]] = {}
    with _embedding_cache_lock:
        for text in texts:
            cached = _embedding_cache.get(text)
            if cached is not None:
                _embedding_cache.move_to_end(text)
                embeddings_by_text[text] = cached
            elif text not in embeddings_by_text and text not in uncached_text_set:
                uncached_texts.append(text)
                uncached_text_set.add(text)

    if uncached_texts:
        model = get_embedding_model()
        generated_embeddings = model.encode(
            uncached_texts,
            batch_size=batch_size or settings.embedding_batch_size,
            show_progress_bar=False
        )
        generated_by_text = {
            text: embedding.tolist()
            for text, embedding in zip(uncached_texts, generated_embeddings)
        }
        embeddings_by_text.update(generated_by_text)
        _cache_embeddings(generated_by_text)

    for chunk, text in zip(eligible_chunks, texts):
        chunk["embedding"] = embeddings_by_text[text].copy()
    
    logger.info(
        f"Embedding generation complete. "
        f"Processed: {len(eligible_chunks)}, Cached: {len(eligible_chunks) - len(uncached_texts)}, Failed: {failed_count}, "
        f"Model: {MODEL_NAME}"
    )
    
    return chunks
