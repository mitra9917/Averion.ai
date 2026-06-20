from app.ai.embeddings import embed_text
from app.ai.security import filter_chunks_by_score
from app.ai.vector_store import search_similar
from app.core.config import settings


def retrieve_chunks(
    query: str,
    top_k: int = 3,
    organization_id: str | None = None,
    min_score: float | None = None
) -> list[dict]:
    """
    Retrieve similar chunks for a given query with security filtering.
    
    Args:
        query: User query text
        top_k: Number of results to return from vector search
        organization_id: Organization ID for multi-tenant isolation
        min_score: Cosine distance threshold (uses config default 1.3 if None)
        
    Returns:
        List of similar chunks with text, metadata, and cosine distance scores
        Only returns chunks that meet the similarity threshold (score <= min_score)
        
    Score Semantics for all-MiniLM-L6-v2:
        - Scores represent cosine distance (0.0 = identical, 2.0 = opposite)
        - Lower scores indicate MORE similarity
        - min_score is the maximum acceptable distance
        - Default threshold (1.3) allows moderately to somewhat similar chunks
        
    Security:
        - Filters results by cosine distance to prevent irrelevant context
        - Enforces organization boundaries for multi-tenant isolation
        - Returns empty list if no chunks meet threshold
        
    Example:
        Query: "What is data management?"
        Results before filtering (with threshold=1.3):
        - Chunk 1: score=0.35 (highly similar) → KEPT
        - Chunk 2: score=0.82 (moderately similar) → KEPT
        - Chunk 3: score=1.15 (somewhat similar) → KEPT
        - Chunk 4: score=1.45 (weakly similar) → FILTERED OUT
    """
    # Validate input
    if not query or not query.strip():
        return []
    
    # Generate query embedding
    query_embedding = embed_text(query)
    
    # Determine organization scope
    scoped_org_id = organization_id or settings.default_organization_id
    
    # Call vector search with organization isolation
    results = search_similar(
        query_embedding,
        top_k,
        organization_id=scoped_org_id
    )
    
    # Format output
    output = []
    for result in results:
        output.append({
            "text": result["text"],
            "document_id": result["document_id"],
            "organization_id": result["organization_id"],
            "chunk_index": result["chunk_index"],
            "chunk_id": result["chunk_id"],
            "page_number": result["page_number"],
            "score": result["score"]
        })
    
    # Apply cosine distance threshold filtering
    threshold = min_score if min_score is not None else settings.retrieval_min_score
    filtered_output = filter_chunks_by_score(output, threshold)
    
    return filtered_output

# Made with Bob
