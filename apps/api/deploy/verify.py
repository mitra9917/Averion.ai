"""Verify a deployed API using a dedicated test workspace owner's access token.

Set AVERION_VERIFY_TOKEN in the process environment. The script creates its own
document and conversation and deletes both afterward. It never logs the token.
"""

import argparse
import os
import time
import uuid

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("api_url")
    parser.add_argument("--origin", help="Expected Vercel frontend origin")
    args = parser.parse_args()
    token = os.environ.get("AVERION_VERIFY_TOKEN")
    if not token:
        parser.error("Set AVERION_VERIFY_TOKEN for a dedicated test workspace owner")

    with httpx.Client(base_url=args.api_url.rstrip("/"), timeout=180) as client:
        for route in ["/health", "/health/database", "/health/ai"]:
            response = client.get(route)
            response.raise_for_status()
            payload = response.json()
            assert payload["status"] == "ok", f"Unhealthy component: {route}"
            if route.endswith("/database"):
                assert payload["connected"] is True
            if route.endswith("/ai"):
                assert all(c["ready"] for c in payload["components"])
                assert next(c for c in payload["components"] if c["name"] == "embeddings")["loaded"]
            print(f"PASS {route}", flush=True)

        assert client.get("/documents").status_code == 401, "Anonymous access was accepted"
        print("PASS authentication required", flush=True)
        if args.origin:
            response = client.options("/documents", headers={
                "Origin": args.origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            })
            assert response.headers.get("access-control-allow-origin") == args.origin
            print("PASS frontend CORS", flush=True)

        client.headers["Authorization"] = f"Bearer {token}"
        response = client.get("/users/me")
        response.raise_for_status()
        assert response.json()["role"] == "owner", "Use a dedicated test workspace owner"
        document_id = None
        conversation_id = None
        try:
            filename = f"deployment-check-{uuid.uuid4().hex}.txt"
            response = client.post("/documents/upload", files={
                "file": (filename, b"Verification policy. The document retention period is 37 days.", "text/plain")
            })
            response.raise_for_status()
            document_id = response.json()["document_id"]
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                response = client.get("/documents")
                response.raise_for_status()
                document = next(d for d in response.json() if d["document_id"] == document_id)
                if document["status"] == "ready":
                    assert document["chunks_count"] > 0
                    break
                assert document["status"] != "failed", "Document ingestion failed"
                time.sleep(2)
            else:
                raise AssertionError("Document did not reach ready within 180 seconds")
            print("PASS upload and asynchronous ingestion", flush=True)

            response = client.post("/chat", json={
                "question": "According to the verification policy, what is the document retention period?",
                "conversation_id": None,
            })
            response.raise_for_status()
            answer = response.json()
            conversation_id = answer["conversation_id"]
            assert "37" in answer["answer"], "Answer did not reflect the uploaded document"
            assert any(c["document_id"] == document_id for c in answer["citations"])
            print("PASS live LLM response and matching source citation", flush=True)
            response = client.get(f"/conversations/{conversation_id}")
            response.raise_for_status()
            assert len(response.json()["conversation"]["messages"]) >= 2
            print("PASS saved conversation history", flush=True)
            response = client.post("/feedback", json={
                "message_id": answer["message_id"], "rating": "up"
            })
            response.raise_for_status()
            print("PASS feedback persistence", flush=True)
        finally:
            # Delete only the artifacts created during this invocation.
            cleanup_failures = []
            for resource, identifier in [
                ("conversations", conversation_id), ("documents", document_id)
            ]:
                if identifier:
                    try:
                        response = client.delete(f"/{resource}/{identifier}")
                        response.raise_for_status()
                    except httpx.HTTPError:
                        cleanup_failures.append(f"{resource}/{identifier}")
            if cleanup_failures:
                raise RuntimeError("Verification cleanup required: " + ", ".join(cleanup_failures))
            print("Verification artifacts removed", flush=True)


if __name__ == "__main__":
    main()
