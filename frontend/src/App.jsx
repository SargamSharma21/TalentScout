import React, { useMemo, useState } from 'react';
import axios from 'axios';
import './App.css';
import { TOKEN_KEY, useAuth } from './AuthContext.jsx';

const tierDefinitions = [
  { key: 'high', label: 'High Matches', description: 'Strong alignment with the target role', color: 'red' },
  { key: 'moderate', label: 'Moderate Matches', description: 'Promising candidates with some gaps', color: 'gray' },
  { key: 'low', label: 'Low Matches', description: 'Limited evidence against the requirements', color: 'dim' },
];

function getTierKey(matchTier = '') {
  const normalizedTier = matchTier.toLowerCase();
  if (normalizedTier.includes('strong') || normalizedTier.includes('high')) return 'high';
  if (normalizedTier.includes('moderate') || normalizedTier.includes('medium')) return 'moderate';
  return 'low';
}

function getNumericMatchScore(candidate) {
  const rawScore = candidate.match_percentage ?? candidate.match_score ?? candidate.match_percent;
  if (typeof rawScore === 'number') return rawScore;
  if (typeof rawScore === 'string') {
    const parsedScore = Number.parseFloat(rawScore.replace('%', ''));
    return Number.isNaN(parsedScore) ? null : parsedScore;
  }
  return null;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const { user, logout } = useAuth();
  const [jdFile, setJdFile] = useState(null);
  const [resumeFiles, setResumeFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [error, setError] = useState(null);
  const [openTiers, setOpenTiers] = useState({ high: true, moderate: true, low: false });
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [activeCandidate, setActiveCandidate] = useState(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [screenInOpen, setScreenInOpen] = useState(false);
  const [tierInputValues, setTierInputValues] = useState({ high: '', moderate: '', low: '' });
  const [toast, setToast] = useState('');

  const groupedCandidates = useMemo(() => {
    const groups = { high: [], moderate: [], low: [] };
    (comparisonResult?.rankings || []).forEach((candidate) => {
      groups[getTierKey(candidate.match_tier)].push(candidate);
    });
    Object.values(groups).forEach((candidates) => candidates.sort((left, right) => {
      const leftScore = getNumericMatchScore(left);
      const rightScore = getNumericMatchScore(right);
      if (leftScore === null && rightScore === null) return 0;
      if (leftScore === null) return 1;
      if (rightScore === null) return -1;
      return rightScore - leftScore;
    }));
    return groups;
  }, [comparisonResult]);

  const handleResumeSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    setResumeFiles((currentFiles) => {
      const existingNames = new Set(currentFiles.map((file) => file.name));
      return [...currentFiles, ...selectedFiles.filter((file) => !existingNames.has(file.name))];
    });
    event.target.value = '';
  };

  const removeResume = (fileName) => {
    setResumeFiles((files) => files.filter((file) => file.name !== fileName));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jdFile || resumeFiles.length === 0) {
      setError('Add one job description and at least one resume to begin.');
      return;
    }

    const formData = new FormData();
    formData.append("jd_file", jdFile);
    for (let i = 0; i < resumeFiles.length; i++) {
      formData.append("resume_files", resumeFiles[i]);
    }

    setLoading(true);
    setError(null);
    setComparisonResult(null);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/v1/recruitment/compare-candidates`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
      });
      setComparisonResult(response.data);
    } catch (err) {
      console.error(err);
      setError("Failed to process candidates. Make sure your FastAPI backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const toggleTier = (tierKey) => {
    setOpenTiers((current) => ({ ...current, [tierKey]: !current[tierKey] }));
  };

  const toggleCandidate = (candidate) => {
    setSelectedCandidates((current) => current.some((item) => item.candidate_name === candidate.candidate_name)
      ? current.filter((item) => item.candidate_name !== candidate.candidate_name)
      : [...current, candidate]);
  };

  const selectTopCandidates = (tierKey) => {
    const requestedCount = Number.parseInt(tierInputValues[tierKey], 10);
    if (!requestedCount || requestedCount < 1) return;
    const candidatesToSelect = groupedCandidates[tierKey].slice(0, requestedCount);
    setSelectedCandidates((current) => {
      const selected = new Map(current.map((candidate) => [candidate.candidate_name, candidate]));
      candidatesToSelect.forEach((candidate) => selected.set(candidate.candidate_name, candidate));
      return Array.from(selected.values());
    });
    setTierInputValues((current) => ({ ...current, [tierKey]: '' }));
  };

  const approveSelected = () => {
    setScreenInOpen(false);
    setSelectedCandidates([]);
    setToast("[ SUCCESS: Screened candidates' details sent to the team ]");
    window.setTimeout(() => setToast(''), 4200);
  };

  const isSelected = (candidate) => selectedCandidates.some((item) => item.candidate_name === candidate.candidate_name);

  const getInterviewQuestions = (candidate) => candidate.interview_questions?.length
    ? candidate.interview_questions
    : (candidate.critical_gaps || []).slice(0, 3).map((gap) => `Can you walk us through your hands-on experience with ${gap.replace(/[.!?]+$/, '')}?`);

  const getMatchValue = (candidate) => candidate.match_percentage ?? candidate.match_score ?? candidate.match_percent ?? '—';

  return (
    <div className="app-shell">
      <div className="page-grid" />
      <main className="dashboard">
        <header className="topbar">
          <a className="brand" href="/" aria-label="TalentScout home"><span className="brand-mark">TS</span><span>TalentScout</span></a>
          <div className="header-actions"><span className="status-label"><span className="status-dot" /> Evidence engine online</span><div className="profile-menu"><span className="profile-badge" title={user?.email}>{user?.full_name}</span><button type="button" onClick={logout}>Logout</button></div></div>
        </header>

        <section className="intro">
          <p className="eyebrow">01 / Candidate intelligence</p>
          <h1>Find the signal<br /><span>in every resume.</span></h1>
          <p className="intro-copy">Compare a full candidate slate against one role with evidence-grounded analysis.</p>
        </section>

        <form onSubmit={handleSubmit} className="upload-panel">
          <div className="panel-heading"><div><p className="eyebrow">Workspace</p><h2>Build a comparison set</h2></div><span className="mono-label">PDF / MULTI-INPUT</span></div>
          <div className="upload-grid">
            <label className="dropzone">
              <span className="step-number">01</span><span className="upload-icon">+</span>
              <span className="field-title">Job description</span><span className="field-hint">One PDF file, up to 10 MB</span>
              <input type="file" accept=".pdf,application/pdf" onChange={(event) => setJdFile(event.target.files[0] || null)} />
              {jdFile && <span className="selected-file">{jdFile.name}</span>}
            </label>
            <label className="dropzone resumes-zone">
              <span className="step-number">02</span><span className="upload-icon">+</span>
              <span className="field-title">Candidate resumes</span><span className="field-hint">Select multiple PDF files</span>
              <input type="file" accept=".pdf,application/pdf" multiple onChange={handleResumeSelection} />
              <span className="selected-file">{resumeFiles.length} resume{resumeFiles.length === 1 ? '' : 's'} staged</span>
            </label>
          </div>

          {resumeFiles.length > 0 && <div className="file-list" aria-label="Selected resumes">
            {resumeFiles.map((file) => <div className="file-chip" key={file.name}><span className="file-type">PDF</span><span className="file-name">{file.name}</span><span className="file-size">{formatFileSize(file.size)}</span><button type="button" onClick={() => removeResume(file.name)} aria-label={`Remove ${file.name}`}>x</button></div>)}
          </div>}

          <div className="form-footer"><span className="form-note">{resumeFiles.length ? `${resumeFiles.length} candidate${resumeFiles.length === 1 ? '' : 's'} ready for analysis` : 'Start by adding your source files'}</span><button className="primary-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Processing slate</> : <>Run comparison <span>{'->'}</span></>}</button></div>
        </form>

        {error && <div className="error-banner" role="alert"><strong>Analysis unavailable</strong><span>{error}</span></div>}

        {loading && <div className="loading-panel"><span className="loader-line" /><div><strong>Reading candidate evidence</strong><span>Parsing resumes and grounding the comparison...</span></div><span className="loading-count">LIVE</span></div>}

        {comparisonResult && <section className="results-section">
          <div className="results-header"><div><p className="eyebrow">02 / Comparison output</p><h2>{comparisonResult.role}</h2></div><div className="candidate-total"><strong>{comparisonResult.total_candidates_evaluated}</strong><span>candidates evaluated</span></div></div>
          {comparisonResult.comparative_analysis_notes && <div className="analysis-note"><span className="note-mark">//</span><div><span className="note-label">Comparative analysis</span><p>{comparisonResult.comparative_analysis_notes}</p></div></div>}
          <div className="tier-list">
            {tierDefinitions.map((tier) => <div className={`tier-accordion tier-${tier.color}`} key={tier.key}>
              <button className="tier-header" type="button" onClick={() => toggleTier(tier.key)} aria-expanded={openTiers[tier.key]}><span className="chevron">{openTiers[tier.key] ? '-' : '+'}</span><span className="tier-title">{tier.label}</span><span className="tier-description">{tier.description}</span><span className="tier-count">{String(groupedCandidates[tier.key].length).padStart(2, '0')}</span></button>
              {openTiers[tier.key] && <div className="tier-content">{groupedCandidates[tier.key].length ? <>
                <div className="bulk-select-bar"><span className="bulk-label">Bulk select / {tier.label}</span><input type="number" min="1" max={groupedCandidates[tier.key].length} value={tierInputValues[tier.key]} onChange={(event) => setTierInputValues((current) => ({ ...current, [tier.key]: event.target.value }))} placeholder="N" aria-label={`Number of ${tier.label} candidates to select`} /><button type="button" onClick={() => selectTopCandidates(tier.key)}>Select top X</button></div>
                <div className="candidate-table" role="table" aria-label={`${tier.label} candidates`}>
                <div className="candidate-table-head" role="row"><span aria-hidden="true" /><span>Candidate</span><span>Match</span><span>Signal / top strengths</span><span aria-hidden="true" /></div>
                {groupedCandidates[tier.key].map((candidate, index) => <article className={`candidate-row ${isSelected(candidate) ? 'is-selected' : ''}`} key={`${candidate.candidate_name}-${index}`} role="row" onClick={() => setActiveCandidate(candidate)}>
                  <label className="candidate-checkbox" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={isSelected(candidate)} onChange={() => toggleCandidate(candidate)} aria-label={`Select ${candidate.candidate_name}`} /><span /></label>
                  <div className="candidate-name-cell"><span className="candidate-index">{String(index + 1).padStart(2, '0')}</span><strong>{candidate.candidate_name}</strong></div>
                  <div className="match-cell"><span className="match-value">{getMatchValue(candidate)}{getMatchValue(candidate) !== '—' && '%'}</span><span>{candidate.match_tier}</span></div>
                  <div className="skill-signal">{(candidate.key_strengths || []).slice(0, 3).map((strength, strengthIndex) => <span key={strengthIndex}>{strength}</span>)}</div>
                  <span className="row-arrow">-&gt;</span>
                </article>)}
                </div>
              </> : <div className="empty-tier">No candidates in this tier.</div>}</div>}
            </div>)}
          </div>
        </section>}

        {selectedCandidates.length > 0 && <aside className="comparison-tray" aria-label="Selected candidates comparison tray">
          <div className="tray-selection"><span className="tray-kicker">Selected / {String(selectedCandidates.length).padStart(2, '0')}</span><div className="tray-chips">{selectedCandidates.map((candidate) => <span className="tray-chip" key={candidate.candidate_name}>{candidate.candidate_name}<button type="button" onClick={() => toggleCandidate(candidate)} aria-label={`Remove ${candidate.candidate_name}`}>x</button></span>)}</div></div>
          <div className="dock-actions"><button className="compare-button" type="button" onClick={() => setComparisonOpen(true)}>Compare <span>-&gt;</span></button><button className="screen-button" type="button" onClick={() => setScreenInOpen(true)}>Screen in <span>-&gt;</span></button></div>
        </aside>}

        {activeCandidate && <div className="modal-layer" role="presentation" onClick={() => setActiveCandidate(null)}>
          <section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="candidate-detail-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setActiveCandidate(null)} aria-label="Close candidate details">x</button>
            <p className="eyebrow">Candidate deep dive</p><div className="drawer-title"><div><span className="candidate-index">PROFILE / {activeCandidate.match_tier}</span><h2 id="candidate-detail-title">{activeCandidate.candidate_name}</h2></div><span className="detail-score">{getMatchValue(activeCandidate)}{getMatchValue(activeCandidate) !== '—' && '%'}</span></div>
            <div className="drawer-columns"><div className="drawer-section strengths-section"><h3>Key strengths</h3><ul>{(activeCandidate.key_strengths || []).map((strength, index) => <li key={index}>{strength}</li>)}</ul></div><div className="drawer-section gaps-section"><h3>Critical gaps</h3><ul>{(activeCandidate.critical_gaps || []).map((gap, index) => <li key={index}>{gap}</li>)}</ul></div></div>
            <div className="drawer-section interview-kit"><div className="section-heading"><h3>Suggested questions</h3><span>INTERVIEW KIT</span></div><ol>{getInterviewQuestions(activeCandidate).map((question, index) => <li key={index}>{question}</li>)}</ol></div>
          </section>
        </div>}

        {comparisonOpen && <div className="modal-layer" role="presentation" onClick={() => setComparisonOpen(false)}>
          <section className="comparison-modal" role="dialog" aria-modal="true" aria-labelledby="comparison-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setComparisonOpen(false)} aria-label="Close comparison">x</button><p className="eyebrow">Head-to-head analysis</p><h2 id="comparison-title">Compare selected</h2><p className="comparison-subtitle">A focused view of the evidence across {selectedCandidates.length} selected candidates.</p>
            <div className="matrix-wrap"><table className="comparison-matrix"><thead><tr><th>Signal</th>{selectedCandidates.map((candidate) => <th key={candidate.candidate_name}>{candidate.candidate_name}</th>)}</tr></thead><tbody><tr><th>Match tier</th>{selectedCandidates.map((candidate) => <td key={candidate.candidate_name}>{candidate.match_tier}</td>)}</tr><tr><th>Match score</th>{selectedCandidates.map((candidate) => <td key={candidate.candidate_name} className="matrix-score">{getMatchValue(candidate)}{getMatchValue(candidate) !== '—' && '%'}</td>)}</tr><tr><th>Strengths</th>{selectedCandidates.map((candidate) => <td key={candidate.candidate_name}><ul className="matrix-list matrix-strengths">{(candidate.key_strengths || []).slice(0, 3).map((strength, index) => <li key={index}>{strength}</li>)}</ul></td>)}</tr><tr><th>Gaps</th>{selectedCandidates.map((candidate) => <td key={candidate.candidate_name}><ul className="matrix-list matrix-gaps">{(candidate.critical_gaps || []).slice(0, 2).map((gap, index) => <li key={index}>{gap}</li>)}</ul></td>)}</tr></tbody></table></div>
          </section>
        </div>}

        {screenInOpen && <div className="modal-layer screen-review-layer" role="presentation" onClick={() => setScreenInOpen(false)}>
          <section className="comparison-modal screen-review" role="dialog" aria-modal="true" aria-labelledby="screen-review-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setScreenInOpen(false)} aria-label="Close screen in review">x</button><p className="eyebrow">Final review / {String(selectedCandidates.length).padStart(2, '0')} selected</p><h2 id="screen-review-title">Screen in candidates</h2><p className="comparison-subtitle">Confirm the shortlist before sending candidate details to the team.</p>
            <div className="review-table"><div className="review-row review-head"><span>Name</span><span>Match score</span><span>Top strengths</span></div>{selectedCandidates.map((candidate) => <div className="review-row" key={candidate.candidate_name}><strong>{candidate.candidate_name}</strong><span className="matrix-score">{getMatchValue(candidate)}{getMatchValue(candidate) !== '—' && '%'}</span><ul className="review-strength-list">{(candidate.key_strengths || []).slice(0, 3).map((strength, index) => <li key={index}>{strength}</li>)}</ul></div>)}</div>
            <div className="review-footer"><span className="mono-label">Action cannot be undone</span><button className="screen-button approve-button" type="button" onClick={approveSelected}>Approve &amp; send <span>-&gt;</span></button></div>
          </section>
        </div>}
        {toast && <div className="success-toast" role="status">{toast}</div>}
    </main>
    </div>
  );
}

export default App;