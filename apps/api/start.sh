#!/bin/bash

# Start the document ingestion worker in the background
python -m app.workers.document_ingestion &

# Start the web server in the foreground
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-graceful-shutdown 30

# Made with Bob
