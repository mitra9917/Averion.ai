"""Download the embedding model during Render build (no app imports needed)."""

import os

MODEL_NAME = os.getenv(
    "EMBEDDING_MODEL_NAME",
    "sentence-transformers/all-MiniLM-L6-v2",
)

if __name__ == "__main__":
    if os.getenv("EMBEDDING_PROVIDER", "local") == "aws_lambda":
        print("AWS provides embeddings; no local model is needed on Render.")
    else:
        from sentence_transformers import SentenceTransformer

        print(f"Caching embedding model: {MODEL_NAME}")
        SentenceTransformer(MODEL_NAME)
        print("Embedding model cached.")
