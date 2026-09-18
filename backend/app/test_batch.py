import requests

url = "http://127.0.0.1:8000/api/v1/recruitment/compare-candidates"

# Make sure you place a dummy 'jd.pdf' and two resume PDFs ('resume1.pdf', 'resume2.pdf') in your folder, 
# or change these filenames to match files you already have!
files = [
    ("jd_file", ("jd.pdf", open("Job Description - Senior Full-Stack Engineer.pdf", "rb"), "application/pdf")),
    ("resume_files", ("resume1.pdf", open("resume_2026_2.pdf", "rb"), "application/pdf")),
    ("resume_files", ("resume2.pdf", open("final_resume.pdf", "rb"), "application/pdf")),
]

response = requests.post(url, files=files)
print(response.json())