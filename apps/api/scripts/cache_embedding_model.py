"""Download the embedding model during Render build (no app imports needed)."""

import os

from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv(
    "EMBEDDING_MODEL_NAME",
    "sentence-transformers/all-MiniLM-L6-v2",
)

if __name__ == "__main__":
    print(f"Caching embedding model: {MODEL_NAME}")
    SentenceTransformer(MODEL_NAME)
    print("Embedding model cached.")
