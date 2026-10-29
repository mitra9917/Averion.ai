"""Download the embedding model during Render build so runtime stays within 512 MB."""

from sentence_transformers import SentenceTransformer

from app.core.config import settings

if __name__ == "__main__":
    SentenceTransformer(settings.embedding_model_name)
