# TalentScout

TalentScout is a resume screening application that compares multiple PDF resumes against a job description. The FastAPI backend extracts PDF text and uses Azure OpenAI structured responses to parse, evaluate, rank, and generate interview questions. The React frontend provides the upload and comparison workflow.

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer and npm
- An Azure OpenAI resource with a deployed chat model

## Project structure

```text
backend/   FastAPI API and PDF/LLM processing
frontend/  React + Vite user interface
```

## Backend setup

From the repository root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` with the Azure OpenAI settings used by the API:

```env
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_DEPLOYMENT_NAME=your-model-deployment-name
```

Start the API from the `backend` directory:

```bash
uvicorn app.main:app --reload --port 8000
```

The API documentation is available at <http://127.0.0.1:8000/docs>.

## Frontend setup

In a second terminal, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually <http://localhost:5173>. The frontend expects the backend at `http://127.0.0.1:8000`.

## Supported API routes

- `POST /api/v1/jd/parse` parses one job description PDF.
- `POST /api/v1/resume/parse` parses one resume PDF.
- `POST /api/v1/recruitment/batch-process` parses one job description and multiple resumes.
- `POST /api/v1/recruitment/evaluate-candidate` evaluates one resume against a job description.
- `POST /api/v1/recruitment/generate-interview-kit` generates interview questions.
- `POST /api/v1/recruitment/compare-candidates` compares and ranks multiple resumes. This is the route used by the frontend.

All upload fields accept PDF files. Use the field names shown in the API documentation when calling the routes directly.

## Security and local files

Keep API keys in `backend/.env`; do not commit them. Local virtual environments, uploaded files, generated PDFs, frontend dependencies, and build output are excluded by `.gitignore`.
