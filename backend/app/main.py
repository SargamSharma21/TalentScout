from fastapi import FastAPI, File, UploadFile, HTTPException , Form
import pymupdf
from pydantic import BaseModel, Field
from typing import List, Optional
import os
from openai import AzureOpenAI
from dotenv import load_dotenv
from typing import List


load_dotenv()

load_dotenv()  # This loads variables from your .env file

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
)
DEPLOYMENT_NAME = os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4.1-mini")

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="RecruitAI Backend")

# Add CORS so your React frontend can talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev; lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client pointing to Microsoft Foundry

class ExperienceRequirement(BaseModel):
    minimum_years: Optional[int] = None

class JobDescriptionSchema(BaseModel):
    role: str
    experience: ExperienceRequirement
    required_skills: List[str]
    preferred_skills: List[str]
    responsibilities: List[str]

@app.post("/api/v1/jd/parse", response_model=JobDescriptionSchema)
async def parse_jd(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        doc = pymupdf.open(stream=contents, filetype="pdf")
        extracted_text = "".join([page.get_text() for page in doc])
        cleaned_text = "\n".join([line.strip() for line in extracted_text.splitlines() if line.strip()])
        
        completion = client.beta.chat.completions.parse(
            model=DEPLOYMENT_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise recruitment assistant. Extract the job role, minimum experience requirements, required skills, preferred skills, and responsibilities from the given Job Description."
                },
                {
                    "role": "user",
                    "content": cleaned_text
                }
            ],
            response_format=JobDescriptionSchema,
        )
        return completion.choices[0].message.parsed
        
    except Exception as e:
        print(f"\n--- AZURE ERROR DEBUG ---: {str(e)}\n")
        raise HTTPException(status_code=500, detail=str(e))

class ResumeSchema(BaseModel):
    candidate_name: str
    cgpa: str
    raw_text: str
    skills: List[str]
    experience_years: Optional[float] = None

from enum import Enum

class EvidenceStatus(str, Enum):
    EVIDENCED = "EVIDENCED"
    PARTIAL = "PARTIAL"
    NOT_EVIDENCED = "NOT_EVIDENCED"

class RequirementMatch(BaseModel):
    requirement: str
    category: str  # e.g., "Required Skill", "Preferred Skill", or "Experience"
    status: EvidenceStatus
    evidence_found: Optional[str] = None
    gap_notes: Optional[str] = None

class CandidateEvaluationSchema(BaseModel):
    candidate_name: str
    target_role: str
    overall_assessment_summary: str
    requirement_matches: List[RequirementMatch]

@app.post("/api/v1/resume/parse", response_model=ResumeSchema)
async def parse_resume(file: UploadFile = File(...)):
    # 1. Extract text from uploaded Resume PDF
    contents = await file.read()
    doc = pymupdf.open(stream=contents, filetype="pdf")
    extracted_text = "".join([page.get_text() for page in doc])
    cleaned_text = "\n".join([line.strip() for line in extracted_text.splitlines() if line.strip()])
    
    # 2. Use Foundry to extract candidate details cleanly
    completion = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {
                "role": "system",
                "content": "You are a precise resume parser. Extract the candidate's name, list of technical/soft skills, and total years of experience from the resume text."
            },
            {
                "role": "user",
                "content": cleaned_text
            }
        ],
        response_format=ResumeSchema,
    )
    
    resume_data = completion.choices[0].message.parsed
    # Keep the raw text available in the response object for our upcoming RAG step
    resume_data.raw_text = cleaned_text
    return resume_data

class BatchAnalysisRequest(BaseModel):
    job_description: JobDescriptionSchema
    candidates: List[ResumeSchema]

@app.post("/api/v1/recruitment/batch-process")
async def batch_process_candidates(
    jd_file: UploadFile = File(..., description="Job Description PDF"),
    resume_files: List[UploadFile] = File(..., description="Multiple Candidate Resume PDFs")
):
    # 1. Parse the single JD file
    jd_contents = await jd_file.read()
    jd_doc = pymupdf.open(stream=jd_contents, filetype="pdf")
    jd_text = "".join([page.get_text() for page in jd_doc])
    cleaned_jd_text = "\n".join([line.strip() for line in jd_text.splitlines() if line.strip()])
    
    jd_completion = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "You are a precise recruitment assistant. Extract the job role, minimum experience requirements, required skills, preferred skills, and responsibilities from the given Job Description."},
            {"role": "user", "content": cleaned_jd_text}
        ],
        response_format=JobDescriptionSchema,
    )
    parsed_jd = jd_completion.choices[0].message.parsed

    # 2. Loop through and parse each uploaded resume file independently (Candidate Isolation)
    parsed_candidates = []
    for resume_file in resume_files:
        res_contents = await resume_file.read()
        res_doc = pymupdf.open(stream=res_contents, filetype="pdf")
        res_text = "".join([page.get_text() for page in res_doc])
        cleaned_res_text = "\n".join([line.strip() for line in res_text.splitlines() if line.strip()])
        
        res_completion = client.beta.chat.completions.parse(
            model=DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": "You are a precise resume parser. Extract the candidate's name, list of technical/soft skills, and total years of experience from the resume text."},
                {"role": "user", "content": cleaned_res_text}
            ],
            response_format=ResumeSchema,
        )
        candidate_data = res_completion.choices[0].message.parsed
        candidate_data.raw_text = cleaned_res_text
        parsed_candidates.append(candidate_data)

    return {
        "job_description": parsed_jd,
        "total_candidates_processed": len(parsed_candidates),
        "candidates": parsed_candidates
    }


@app.post("/api/v1/recruitment/evaluate-candidate", response_model=CandidateEvaluationSchema)
async def evaluate_candidate(
    jd_file: UploadFile = File(..., description="Job Description PDF"),
    resume_file: UploadFile = File(..., description="Single Candidate Resume PDF")
):
    # 1. Parse JD
    jd_contents = await jd_file.read()
    jd_doc = pymupdf.open(stream=jd_contents, filetype="pdf")
    jd_text = "".join([page.get_text() for page in jd_doc])
    cleaned_jd = "\n".join([line.strip() for line in jd_text.splitlines() if line.strip()])
    
    jd_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "Extract structured job requirements from the JD."},
            {"role": "user", "content": cleaned_jd}
        ],
        response_format=JobDescriptionSchema,
    )
    parsed_jd = jd_comp.choices[0].message.parsed

    # 2. Parse Resume
    res_contents = await resume_file.read()
    res_doc = pymupdf.open(stream=res_contents, filetype="pdf")
    res_text = "".join([page.get_text() for page in res_doc])
    cleaned_res = "\n".join([line.strip() for line in res_text.splitlines() if line.strip()])
    
    res_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "Extract candidate details from the resume."},
            {"role": "user", "content": cleaned_res}
        ],
        response_format=ResumeSchema,
    )
    parsed_res = res_comp.choices[0].message.parsed

    # 3. Perform Evidence-Based Evaluation using Foundry LLM
    evaluation_prompt = f"""
    You are a strict technical recruitment evaluator. Compare the candidate against the Job Description requirements.
    CRITICAL RULE: Rely ONLY on clear evidence found in the resume text. Do NOT assume or invent skills.
    
    JOB DESCRIPTION:
    Role: {parsed_jd.role}
    Required Skills: {parsed_jd.required_skills}
    Preferred Skills: {parsed_jd.preferred_skills}
    Minimum Experience Years: {parsed_jd.experience.minimum_years}
    
    CANDIDATE RESUME TEXT:
    {cleaned_res}
    
    Evaluate each required and preferred skill. For each, state if it is EVIDENCED, PARTIAL, or NOT_EVIDENCED, and quote the exact evidence found or note the gap.
    """

    eval_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "You are a precise, evidence-grounded recruitment matching assistant."},
            {"role": "user", "content": evaluation_prompt}
        ],
        response_format=CandidateEvaluationSchema,
    )
    
    return eval_comp.choices[0].message.parsed

class InterviewQuestion(BaseModel):
    question: str
    category: str  # e.g., "Technical", "Experience-based", "Gap-probing"
    target_skill_or_project: str
    rationale: str  # Why this question was generated based on resume evidence

class InterviewKitSchema(BaseModel):
    candidate_name: str
    target_role: str
    questions: List[InterviewQuestion]


@app.post("/api/v1/recruitment/generate-interview-kit", response_model=InterviewKitSchema)
async def generate_interview_kit(
    jd_file: UploadFile = File(..., description="Job Description PDF"),
    resume_file: UploadFile = File(..., description="Candidate Resume PDF")
):
    # 1. Parse JD
    jd_contents = await jd_file.read()
    jd_doc = pymupdf.open(stream=jd_contents, filetype="pdf")
    jd_text = "".join([page.get_text() for page in jd_doc])
    cleaned_jd = "\n".join([line.strip() for line in jd_text.splitlines() if line.strip()])
    
    jd_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "Extract structured job requirements from the JD."},
            {"role": "user", "content": cleaned_jd}
        ],
        response_format=JobDescriptionSchema,
    )
    parsed_jd = jd_comp.choices[0].message.parsed

    # 2. Parse Resume
    res_contents = await resume_file.read()
    res_doc = pymupdf.open(stream=res_contents, filetype="pdf")
    res_text = "".join([page.get_text() for page in res_doc])
    cleaned_res = "\n".join([line.strip() for line in res_text.splitlines() if line.strip()])
    
    res_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "Extract candidate details from the resume."},
            {"role": "user", "content": cleaned_res}
        ],
        response_format=ResumeSchema,
    )
    parsed_res = res_comp.choices[0].message.parsed

    # 3. Generate Target Interview Kit via Foundry LLM
    kit_prompt = f"""
    You are an expert technical interviewer. Generate a targeted technical interview kit for this candidate applying to this Job Description.
    CRITICAL RULE: Tie every single question directly to something written in their resume or a specific gap against the JD requirements. Do not ask generic fluff.
    
    JOB ROLE: {parsed_jd.role}
    REQUIRED SKILLS: {parsed_jd.required_skills}
    
    CANDIDATE NAME: {parsed_res.candidate_name}
    CANDIDATE RESUME TEXT:
    {cleaned_res}
    """

    kit_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "You are a precise technical hiring manager creating evidence-based interview questions."},
            {"role": "user", "content": kit_prompt}
        ],
        response_format=InterviewKitSchema,
    )
    
    return kit_comp.choices[0].message.parsed

class CandidateComparisonSummary(BaseModel):
    candidate_name: str
    match_percentage: int = Field(..., ge=0, le=100, description="Evidence-based match score from 0 to 100")
    match_tier: str  # e.g., "Strong Match", "Moderate Match", "Weak Match"
    key_strengths: List[str]
    critical_gaps: List[str]

class MultiCandidateComparisonSchema(BaseModel):
    role: str
    total_candidates_evaluated: int
    rankings: List[CandidateComparisonSummary]
    comparative_analysis_notes: str

@app.post("/api/v1/recruitment/compare-candidates", response_model=MultiCandidateComparisonSchema)
async def compare_candidates(
    jd_file: UploadFile = File(..., description="Job Description PDF"),
    resume_files: List[UploadFile] = File(..., description="Multiple Candidate Resume PDFs")
):
    # 1. Parse JD
    jd_contents = await jd_file.read()
    jd_doc = pymupdf.open(stream=jd_contents, filetype="pdf")
    jd_text = "".join([page.get_text() for page in jd_doc])
    cleaned_jd = "\n".join([line.strip() for line in jd_text.splitlines() if line.strip()])
    
    jd_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "Extract structured job requirements from the JD."},
            {"role": "user", "content": cleaned_jd}
        ],
        response_format=JobDescriptionSchema,
    )
    parsed_jd = jd_comp.choices[0].message.parsed

    # 2. Parse all resumes independently (Candidate Isolation)
    candidates_data = []
    for resume_file in resume_files:
        res_contents = await resume_file.read()
        res_doc = pymupdf.open(stream=res_contents, filetype="pdf")
        res_text = "".join([page.get_text() for page in res_doc])
        cleaned_res = "\n".join([line.strip() for line in res_text.splitlines() if line.strip()])
        
        res_comp = client.beta.chat.completions.parse(
            model=DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": "Extract candidate details from the resume."},
                {"role": "user", "content": cleaned_res}
            ],
            response_format=ResumeSchema,
        )
        parsed_res = res_comp.choices[0].message.parsed
        candidates_data.append({
            "name": parsed_res.candidate_name,
            "text": cleaned_res
        })

    # 3. Build Comparative Prompt for Foundry LLM
    candidates_payload = ""
    for idx, cand in enumerate(candidates_data, 1):
        candidates_payload += f"\n--- CANDIDATE {idx}: {cand['name']} ---\n{cand['text']}\n"

    comparison_prompt = f"""
    You are an expert technical recruitment committee. Compare all the provided candidates against the following Job Description.
    CRITICAL RULE: Rely strictly on evidence found in each resume. Do not assume or invent qualifications.
    
    JOB ROLE: {parsed_jd.role}
    REQUIRED SKILLS: {parsed_jd.required_skills}
    PREFERRED SKILLS: {parsed_jd.preferred_skills}
    
    CANDIDATES TO COMPARE:
    {candidates_payload}
    
    Provide an objective, evidence-based comparative summary for every candidate.
    For each candidate, calculate match_percentage as an integer from 0 to 100 using this rubric:
    - 70% required skills and responsibilities evidenced in the resume
    - 20% relevant experience alignment
    - 10% preferred skills evidenced in the resume
    Penalize missing or contradicted requirements. Do not infer evidence that is not present.
    Assign match_tier from Strong Match, Moderate Match, or Weak Match so it agrees with the score:
    70-100 Strong Match, 40-69 Moderate Match, 0-39 Weak Match.
    Return key strengths and critical gaps as concise, separate bullet-ready items.
    """

    comparison_comp = client.beta.chat.completions.parse(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": "You are a precise technical hiring assistant specializing in multi-candidate comparisons."},
            {"role": "user", "content": comparison_prompt}
        ],
        response_format=MultiCandidateComparisonSchema,
    )
    
    parsed_comparison = comparison_comp.choices[0].message.parsed
    parsed_comparison.rankings.sort(key=lambda candidate: candidate.match_percentage, reverse=True)
    return parsed_comparison