# Averion.ai

Averion.ai is a secure Retrieval-Augmented Generation (RAG) platform that enables organizations to upload internal documents, search knowledge bases, and interact with an AI assistant that provides grounded responses with source citations.

## Overview

Companies often have knowledge scattered across PDFs, handbooks, policy documents, and internal notes. Averion.ai solves this by providing a single AI-powered platform to search and query company knowledge with verifiable source citations.

## Features

### Document Management
- **Multi-format Upload**: Support for PDF, TXT, and DOCX files
- **Document Processing**: Automated text extraction and cleaning
- **Metadata Storage**: Document tracking with Supabase PostgreSQL
- **Document Deletion**: Secure document removal with role-based access

### AI-Powered Search & Chat
- **Semantic Search**: Vector-based similarity search using embeddings
- **RAG (Retrieval-Augmented Generation)**: Context-aware responses using retrieved document chunks
- **Source Citations**: Every answer includes references to source documents with page numbers
- **Conversation History**: Persistent chat sessions with message tracking

### Security Features
- **Prompt Injection Protection**: Detects and blocks malicious query patterns
- **Citation Enforcement**: Ensures all answers are grounded in retrieved context
- **Context Limiting**: Only relevant chunks sent to LLM, no raw database exposure
- **Output Filtering**: Sanitizes responses to prevent secret leakage
- **Similarity Threshold**: Configurable relevance filtering (default: 0.7)
- **Organization Isolation**: Multi-tenant data separation
- **Security Audit Logging**: Tracks security events for monitoring

### User Management & Authentication
- **Supabase Auth Integration**: JWT-based authentication
- **Organization Management**: Team-based workspaces
- **Role-Based Access Control**: Owner and member roles
- **Team Invitations**: Email-based team member onboarding
- **Profile Management**: User profile and organization settings

### Feedback System
- **Thumbs Up/Down**: Rate answer quality
- **Correction Text**: Provide feedback for incorrect answers
- **Feedback Export**: JSONL and CSV export for model improvement

## Architecture

```
User Query
    ↓
[Security Check: Prompt Injection Detection]
    ↓
[Embedding Generation]
    ↓
[Vector Search with Similarity Threshold]
    ↓
[Context Retrieval & Filtering]
    ↓
[RAG Prompt Building with Security Instructions]
    ↓
[LLM Generation (Groq/OpenAI)]
    ↓
[Output Filtering & Sanitization]
    ↓
[Citation Mapping]
    ↓
Grounded Response with Citations
```

### Data Flow

```
Document Upload
    ↓
Text Extraction (PyPDF2, python-docx)
    ↓
Text Cleaning & Chunking
    ↓
Embedding Generation (sentence-transformers)
    ↓
Storage:
  - Metadata → Supabase PostgreSQL
  - Chunks → Supabase PostgreSQL
  - Vectors → PostgreSQL pgvector
    ↓
Ready for Retrieval
```

## Tech Stack

### Frontend
- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Authentication**: Supabase Auth (@supabase/supabase-js)
- **Build Tool**: Turbopack

### Backend
- **Framework**: FastAPI 0.116
- **Language**: Python 3.12
- **Validation**: Pydantic
- **Server**: Uvicorn with standard extras

### Database & Storage
- **Primary Database**: Supabase PostgreSQL
- **Vector Search**: PostgreSQL pgvector extension
- **Connection**: psycopg 3.2 (binary)

### AI/ML Stack
- **Embeddings**: sentence-transformers/all-MiniLM-L6-v2
- **LLM Providers**: 
  - Groq (openai/gpt-oss-20b)
  - OpenAI (gpt-4o-mini)
  - Mock provider for testing
- **Document Processing**: PyPDF2, python-docx
- **Authentication**: PyJWT 2.13, cryptography 46.0

### Development & Testing
- **Testing**: pytest with 122 test cases
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, TypeScript strict mode
- **API Client**: OpenAI SDK (compatible with Groq)

## Installation

### Prerequisites

- **Node.js**: 22.x
- **npm**: 10.x
- **Python**: 3.12.x
- **PostgreSQL**: Via Supabase or local instance
- **Git**: For version control

### Clone Repository

```bash
git clone https://github.com/mitra9917/Averion.ai.git
cd Averion.ai
```

### Frontend Setup

```bash
nvm use
cd apps/web
npm ci
npm run dev
```

The frontend will run on `http://localhost:3000`

### Backend Setup

```bash
cd apps/api

# Create virtual environment
python3.12 -m venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the stable, single-process local server
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API will run on `http://localhost:8000`

API documentation available at `http://localhost:8000/docs`

In a second terminal, start the asynchronous document worker:

```bash
cd apps/api
source .venv/bin/activate
python -m app.workers.document_ingestion
```

## Environment Variables

### Backend (.env)

Create `apps/api/.env` from `apps/api/.env.example`:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database
DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
DOCUMENT_STORAGE_BACKEND=supabase
SUPABASE_STORAGE_BUCKET=documents
MAX_DOCUMENT_SIZE_BYTES=104857600

# Authentication
ALLOWED_EMAIL_DOMAINS=example.com,company.com
AUTH_REQUIRED=false

# File Upload
UPLOAD_DIR=./uploads

# CORS
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Embeddings
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_BATCH_SIZE=8

# Document ingestion worker
DOCUMENT_JOB_MAX_ATTEMPTS=3
DOCUMENT_JOB_RETRY_DELAY_SECONDS=30
DOCUMENT_JOB_LEASE_SECONDS=900
DOCUMENT_WORKER_POLL_SECONDS=2
DOCUMENT_MAX_CHUNKS=2000

# Retrieval
RETRIEVAL_TOP_K=5
RETRIEVAL_MIN_SCORE=0.7

# LLM Configuration
LLM_PROVIDER=groq
LLM_PROVIDER_API_KEY=your-api-key-here
LLM_MODEL_NAME=openai/gpt-oss-20b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=1000
```

**Variable Descriptions:**

- `DATABASE_URL`: PostgreSQL connection string for Supabase
- `DEFAULT_ORGANIZATION_ID`: Fallback organization UUID
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_JWT_SECRET`: JWT secret from Supabase dashboard
- `ALLOWED_EMAIL_DOMAINS`: Comma-separated allowed email domains (empty = allow all)
- `AUTH_REQUIRED`: Enable/disable authentication (true/false)
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key for the private document bucket
- `DOCUMENT_STORAGE_BACKEND`: Use `supabase` in deployed environments
- `SUPABASE_STORAGE_BUCKET`: Private bucket name, normally `documents`
- `MAX_DOCUMENT_SIZE_BYTES`: Maximum accepted document payload size
- `UPLOAD_DIR`: Local-only object store when `DOCUMENT_STORAGE_BACKEND=local`
- `CORS_ORIGINS`: Comma-separated allowed frontend origins
- `EMBEDDING_MODEL_NAME`: Hugging Face model for embeddings
- `RETRIEVAL_TOP_K`: Number of chunks to retrieve per query
- `RETRIEVAL_MIN_SCORE`: Minimum similarity score threshold (0.0-1.0, lower = more similar)
- `LLM_PROVIDER`: LLM provider (mock/openai/groq)
- `LLM_PROVIDER_API_KEY`: API key for OpenAI or Groq
- `LLM_MODEL_NAME`: Model name for the selected provider (for Groq: `openai/gpt-oss-20b`)
- `LLM_TEMPERATURE`: Response randomness (0.0-1.0)
- `LLM_MAX_TOKENS`: Maximum response length

### Frontend (.env.local)

Create `apps/web/.env.local` from `apps/web/.env.example`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_AUTH_REDIRECT_URL=http://localhost:3000/auth/callback
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=example.com,company.com
```

## Running the Project

### 1. Start Backend

```bash
cd apps/api
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Start Frontend

```bash
cd apps/web
npm run dev
```

### 3. Access Application

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### 4. Upload Documents

1. Navigate to Documents page
2. Click "Upload Document"
3. Select PDF, TXT, or DOCX file
4. Wait for processing

### 5. Ask Questions

1. Navigate to Chat page
2. Type your question
3. Receive answer with source citations
4. Click citations to view source snippets

### 6. Provide Feedback

1. Use thumbs up/down on answers
2. Optionally provide correction text
3. Feedback stored for model improvement

## API Overview

### Health Endpoints

- `GET /health` - Service health check
- `GET /health/database` - Database connectivity check

### Document Endpoints

- `GET /documents` - List all documents (organization-scoped)
- `POST /documents/upload` - Upload new document (PDF/TXT/DOCX)
- `DELETE /documents/{document_id}` - Delete document (owner only)

### Chat Endpoints

- `POST /chat` - Send question and receive RAG response with citations

### Feedback Endpoints

- `POST /feedback` - Submit feedback for a message
- `GET /feedback` - List feedback records (with filters)

### User Management Endpoints

- `GET /users/me` - Get current user profile
- `PATCH /users/me` - Update user profile
- `GET /users/team` - Get organization team members
- `PATCH /users/organization` - Update organization settings (owner only)
- `PATCH /users/team/{user_id}/role` - Update team member role (owner only)
- `POST /users/invitations` - Create team invitation (owner only)
- `GET /users/invitations` - List pending invitations
- `POST /users/invitations/{invitation_id}/accept` - Accept invitation
- `DELETE /users/team/{user_id}` - Remove team member (owner only)

## Example Usage

### Upload a Document

```bash
curl -X POST "http://localhost:8000/documents/upload" \
  -F "file=@company-handbook.pdf"
```

### Ask a Question

```bash
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the refund policy?",
    "conversation_id": null
  }'
```

### Response Example

```json
{
  "conversation_id": "uuid-here",
  "message_id": "uuid-here",
  "answer": "The refund policy allows returns within 30 days. [Source 1]",
  "citations": [
    {
      "chunk_id": "doc-uuid:0",
      "document_id": "doc-uuid",
      "chunk_index": 0,
      "filename": "company-handbook.pdf",
      "page_number": 15,
      "snippet": "Refunds are available within 30 days...",
      "score": 0.23
    }
  ],
  "sources": [...]
}
```

## Testing

### Run Backend Tests

```bash
cd apps/api
pytest tests/ -v
```

**Test Coverage:**
- 122 total tests
- API endpoint tests
- RAG pipeline tests
- Security feature tests
- Citation format tests
- Authentication tests
- Database integration tests

### Run Frontend Type Checking

```bash
cd apps/web
npm run typecheck
```

### Run Frontend Linting

```bash
cd apps/web
npm run lint
```

## Project Status

### ✅ Completed Features

- Document upload and processing (PDF, TXT, DOCX)
- Text extraction and cleaning
- Semantic chunking
- Embedding generation
- Vector storage with pgvector
- Semantic search and retrieval
- RAG-based chat with citations
- User-friendly citation format ([Source 1], [Source 2])
- Conversation history
- Feedback system with export
- Supabase authentication
- Organization management
- Team invitations
- Role-based access control
- Prompt injection protection
- Citation enforcement
- Output sanitization
- Security audit logging
- Similarity threshold filtering
- Multi-tenant isolation

### 🚧 In Progress

- Enhanced UI/UX polish
- Advanced analytics dashboard
- Retrieval evaluation metrics

### 📋 Planned Enhancements

- Additional document formats (Excel, PowerPoint)
- Voice input/output
- Multi-language support expansion
- Advanced RBAC with custom roles
- Document versioning
- Collaborative annotations
- Real-time collaboration
- Mobile app
- Slack/Teams integration
- Advanced security hardening
- Performance optimization
- Caching layer

## Security Best Practices

### Implemented Protections

1. **Prompt Injection Detection**: Blocks malicious instructions
2. **Citation Enforcement**: No uncited answers allowed
3. **Context Limiting**: Only relevant chunks sent to LLM
4. **Output Filtering**: Sanitizes secrets from responses
5. **Similarity Threshold**: Filters low-quality matches
6. **Organization Isolation**: Multi-tenant data separation
7. **Audit Logging**: Security event tracking
8. **JWT Authentication**: Secure token-based auth
9. **Role-Based Access**: Owner/member permissions

### Recommendations

- Rotate API keys regularly
- Monitor security logs for injection attempts
- Tune `RETRIEVAL_MIN_SCORE` based on data quality
- Enable `AUTH_REQUIRED=true` in production
- Use strong JWT secrets
- Implement rate limiting for production
- Regular security audits
- Keep dependencies updated

## Contributing

### Development Workflow

1. Pick an issue from GitHub Issues
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and commit: `git commit -m "Add feature"`
4. Push branch: `git push origin feature/your-feature`
5. Open Pull Request with description
6. Link PR to issue: `Closes #issue-number`
7. Wait for review and CI checks
8. Merge after approval

### Code Standards

- **Python**: Follow PEP 8, use type hints
- **TypeScript**: Strict mode enabled
- **Testing**: Write tests for new features
- **Documentation**: Update README for major changes
- **Commits**: Use clear, descriptive messages

### Running CI Locally

**Backend:**
```bash
cd apps/api
pip install -r requirements-dev.txt
pytest tests/
```

**Frontend:**
```bash
cd apps/web
npm run typecheck
npm run lint
npm run build
```

## Documentation

- [Project Plan](docs/PROJECT_PLAN.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Authentication Setup](docs/AUTH_SETUP.md)
- [Repository Structure](docs/REPO_STRUCTURE.md)
- [LLM Testing Guide](docs/LLM_TESTING_GUIDE.md)
- [Embeddings Documentation](docs/EMBEDDINGS.md)

## License

This project is proprietary software. All rights reserved.

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Contact the development team
- Review documentation in `/docs`

---

**Built with ❤️ by the Averion.ai team**
