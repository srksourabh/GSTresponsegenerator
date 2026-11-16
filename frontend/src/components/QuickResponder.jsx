import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import LensScanner from './LensScanner';
import ClarifyingQuestions from './ClarifyingQuestions';
import { formatCurrency } from '../format';
import './quick-responder.css';

const STEPS = [
  { key: 'upload', label: '1. Upload Notice' },
  { key: 'review', label: '2. Lens Scan & Questions' },
  { key: 'generate', label: '3. GST Act Response' },
];

const STAGES = [
  { key: 'stage1', label: 'Counsel Opening Analyses', desc: 'Revenue, Assessee, Procedural & Risk counsel examine the notice' },
  { key: 'stage2', label: 'Cross-Examination', desc: 'Counsel challenge assumptions & test statutory arguments' },
  { key: 'stage3', label: 'Chairman Determination', desc: 'Synthesising the formal reply under the Indian GST Act' },
  { key: 'verification', label: 'Citation Verification', desc: 'Checking every case law & circular against live sources' },
];

export default function QuickResponder({ onAuthError, onOpenMatter }) {
  const [step, setStep] = useState('upload');
  const [tier, setTier] = useState('draft');
  const [config, setConfig] = useState(null);

  const [scanning, setScanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [uploadedNames, setUploadedNames] = useState([]);

  const [extractResult, setExtractResult] = useState(null);
  const [form, setForm] = useState({ notice_type: 'ASMT-10', state: '' });
  const [answers, setAnswers] = useState({});
  const [recon, setRecon] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [estimate, setEstimate] = useState(null);

  const [running, setRunning] = useState(false);
  const [stageStatus, setStageStatus] = useState({});
  const [counselDoneCount, setCounselDoneCount] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [panelResult, setPanelResult] = useState(null);
  const [matterId, setMatterId] = useState(null);
  const [copiedReply, setCopiedReply] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const reconInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.panelConfig();
        setConfig(cfg);
        if (cfg?.default_tier) setTier(cfg.default_tier);
      } catch (err) {
        if (!onAuthError?.(err)) setError(err.message || 'Could not load configuration');
      }
    })();
  }, [onAuthError]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (step !== 'review') return;
    let cancelled = false;
    (async () => {
      try {
        const quote = await api.estimatePanel({
          intake: { defects: form.defects || [] },
          domain: 'gst',
          tier,
        });
        if (!cancelled) setEstimate(quote);
      } catch {
        if (!cancelled) setEstimate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, form.defects, tier]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    setError('');
    setUploadedNames(files.map((f) => f.name));

    const firstImg = files.find((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(firstImg ? URL.createObjectURL(firstImg) : '');

    setStep('review');
    setScanning(true);
    setExtractResult(null);

    try {
      const res = await api.extractNotice(files, { domain: 'gst', tier });
      setExtractResult(res);

      const extracted = res.fields || {};
      setForm({
        notice_type: extracted.notice_type || 'ASMT-10',
        state: extracted.state || '',
        gstin: extracted.gstin || '',
        entity_name: extracted.entity_name || '',
        reference_number: extracted.reference_number || '',
        notice_date: extracted.notice_date || '',
        reply_due_date: extracted.reply_due_date || '',
        section_invoked: extracted.section_invoked || '',
        tax_period: extracted.tax_period || '',
        amount_disputed: extracted.amount_disputed ?? '',
        facts: extracted.facts || '',
        issues: extracted.issues || '',
        defects: extracted.defects || [],
      });

      const initialAnswers = {};
      for (const q of res.questions || []) {
        if (q.default_value !== undefined) initialAnswers[q.id] = q.default_value;
      }
      setAnswers(initialAnswers);
    } catch (err) {
      if (!onAuthError?.(err)) {
        setError(err.message || 'Could not scan the uploaded notice.');
      }
    } finally {
      setScanning(false);
    }
  };

  const handleReconUpload = async (file) => {
    if (!file) return;
    setReconciling(true);
    setError('');
    try {
      const res = await api.uploadReconciliation(file, { domain: 'gst', tier });
      setRecon(res);
    } catch (err) {
      if (!onAuthError?.(err)) setError(err.message || 'Could not read reconciliation Excel.');
    } finally {
      setReconciling(false);
    }
  };

  const handleAnswer = (question, value) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    if (question.field_key) {
      setForm((prev) => ({ ...prev, [question.field_key]: value }));
    }
  };

  const buildIntakePayload = () => {
    const qaLines = (extractResult?.questions || [])
      .map((q) => {
        const ans = (answers[q.id] ?? '').toString().trim();
        if (!ans) return null;
        return `- ${q.category}: ${ans}`;
      })
      .filter(Boolean);

    const baseFacts = (form.facts || '').trim() || extractResult?.text?.slice(0, 1200) || 'GST notice uploaded for statutory reply.';
    const combinedFacts = qaLines.length
      ? `${baseFacts}\n\nTaxpayer Clarifications:\n${qaLines.join('\n')}`
      : baseFacts;

    const numericAmount = parseFloat(String(form.amount_disputed || '').replace(/,/g, ''));

    return {
      ...form,
      gstin: String(form.gstin || '').trim().toUpperCase(),
      amount_disputed: Number.isFinite(numericAmount) ? numericAmount : undefined,
      facts: combinedFacts,
      reconciliation: recon?.summary || undefined,
    };
  };

  const handleGenerate = async () => {
    setError('');
    if (!String(form.state || '').trim()) {
      setError('Please confirm the State / Jurisdiction before generating the reply.');
      return;
    }

    setStep('generate');
    setRunning(true);
    setStageStatus({});
    setCounselDoneCount(0);
    setProgressPercent(5);
    setElapsedSeconds(0);
    setPanelResult(null);
    setMatterId(null);

    const collected = {
      analyses: [],
      cross_exams: [],
      determination: null,
      verification: null,
    };

    const markRunningAsError = () => {
      setStageStatus((s) => {
        const next = { ...s };
        for (const k of Object.keys(next)) {
          if (next[k] === 'running') next[k] = 'error';
        }
        return next;
      });
    };

    try {
      await api.runPanel(
        {
          domain: 'gst',
          tier,
          intake: buildIntakePayload(),
        },
        (type, event) => {
          switch (type) {
            case 'matter_created':
              if (event.matter_id) setMatterId(event.matter_id);
              break;
            case 'grounding_start':
              setProgressPercent((p) => Math.max(p, 8));
              break;
            case 'grounding_complete':
              setProgressPercent((p) => Math.max(p, 12));
              break;
            case 'stage1_start':
              setStageStatus((s) => ({ ...s, stage1: 'running' }));
              setProgressPercent((p) => Math.max(p, 15));
              break;
            case 'counsel_complete':
              setCounselDoneCount((c) => {
                const next = Math.min(4, c + 1);
                setProgressPercent((p) => Math.max(p, 15 + next * 5));
                return next;
              });
              break;
            case 'stage1_complete':
              setStageStatus((s) => ({ ...s, stage1: 'done' }));
              setProgressPercent((p) => Math.max(p, 38));
              collected.analyses = event.data || [];
              setPanelResult({ ...collected });
              break;
            case 'stage2_start':
              setStageStatus((s) => ({ ...s, stage2: 'running' }));
              setProgressPercent((p) => Math.max(p, 42));
              break;
            case 'stage2_complete':
              setStageStatus((s) => ({ ...s, stage2: 'done' }));
              setProgressPercent((p) => Math.max(p, 62));
              collected.cross_exams = event.data || [];
              setPanelResult({ ...collected });
              break;
            case 'stage3_start':
              setStageStatus((s) => ({ ...s, stage3: 'running' }));
              setProgressPercent((p) => Math.max(p, 68));
              break;
            case 'stage3_complete':
              setStageStatus((s) => ({ ...s, stage3: 'done' }));
              setProgressPercent((p) => Math.max(p, 88));
              collected.determination = event.data;
              setPanelResult({ ...collected });
              break;
            case 'verification_start':
              setStageStatus((s) => ({ ...s, verification: 'running' }));
              setProgressPercent((p) => Math.max(p, 92));
              break;
            case 'verification_complete':
              setStageStatus((s) => ({ ...s, verification: 'done' }));
              setProgressPercent(100);
              collected.verification = event.data;
              setPanelResult({ ...collected });
              break;
            case 'summary':
              if (event.data) {
                Object.assign(collected, event.data);
                setPanelResult({ ...collected });
              }
              break;
            case 'complete':
              if (event.matter_id) setMatterId(event.matter_id);
              setProgressPercent(100);
              setPanelResult({ ...collected });
              break;
            case 'error':
              markRunningAsError();
              setError(event.message || 'Panel generation failed.');
              break;
            default:
              break;
          }
        }
      );
      setPanelResult({ ...collected });
    } catch (err) {
      markRunningAsError();
      if (!onAuthError?.(err)) {
        setError(err.message || 'Failed to generate GST notice response.');
      }
    } finally {
      setRunning(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setExtractResult(null);
    setPanelResult(null);
    setMatterId(null);
    setRecon(null);
    setError('');
    setUploadedNames([]);
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl('');
  };

  const determinationText = (() => {
    const det = panelResult?.determination;
    if (!det) return '';
    if (typeof det === 'string') return det;
    if (det.response || det.draft_reply || det.determination || det.summary) {
      return det.response || det.draft_reply || det.determination || det.summary;
    }
    if (det.unstructured_output) return det.unstructured_output;

    const parts = [];
    if (det.recommended_position) {
      parts.push(`## Recommended Position\n\n${det.recommended_position}`);
    }
    if (det.lead_argument) {
      parts.push(`## Lead Argument\n\n${det.lead_argument}`);
    }
    if (det.preliminary_submissions) {
      parts.push(`## Preliminary Submissions\n\n${det.preliminary_submissions}`);
    }
    if (Array.isArray(det.defects) && det.defects.length > 0) {
      parts.push('## Issue-Wise Reply & Legal Submissions');
      det.defects.forEach((d, idx) => {
        const heading = d.heading || `Issue ${idx + 1}`;
        const lines = [`### ${idx + 1}. ${heading}`];
        if (d.our_position) lines.push(`**Position:** ${d.our_position}`);
        if (d.facts) lines.push(`**Facts:** ${d.facts}`);
        if (d.legal_framework) lines.push(`**Legal Framework:** ${d.legal_framework}`);
        if (d.submission) lines.push(`\n${d.submission}`);
        if (d.prayer_relief) lines.push(`\n**Prayer / Relief:** ${d.prayer_relief}`);
        parts.push(lines.join('\n\n'));
      });
    }
    if (Array.isArray(det.risk_flags) && det.risk_flags.length > 0) {
      parts.push(
        `## Risk Flags for Review\n\n${det.risk_flags.map((r) => `- ${r}`).join('\n')}`
      );
    }
    if (det.board_summary) {
      parts.push(`## Executive Summary\n\n${det.board_summary}`);
    }
    return parts.join('\n\n');
  })();

  const copyDraftReply = async () => {
    if (!determinationText) return;
    try {
      await navigator.clipboard.writeText(determinationText);
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const activeStepIdx = step === 'upload' ? 0 : step === 'review' ? 1 : 2;

  return (
    <div className="qr-page">
      <header className="qr-header">
        <div>
          <div className="qr-eyebrow">Indian GST Act Compliance</div>
          <h1 className="qr-title">GST Notice Responder</h1>
          <p className="qr-subtitle">
            Upload or scan any GST notice, answer a few quick questions, and generate a structured statutory reply.
          </p>
        </div>

        <div className="qr-stepper" aria-label="Workflow steps">
          {STEPS.map((s, idx) => (
            <div
              key={s.key}
              className={`qr-step ${idx === activeStepIdx ? 'active' : ''} ${
                idx < activeStepIdx ? 'done' : ''
              }`}
            >
              <span className="qr-step-dot">{idx < activeStepIdx ? '✓' : idx + 1}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div className="alert alert-danger qr-alert" role="alert">
          {error}
        </div>
      )}

      {step === 'upload' && (
        <section className="qr-upload-section">
          <div
            className={`qr-dropzone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <div className="qr-drop-icon" aria-hidden="true">
              ⌖
            </div>
            <h2>Upload or Scan Your GST Notice</h2>
            <p className="muted">
              Supports <strong>PDF</strong> (digital or scanned),{' '}
              <strong>Photos / Images</strong> (PNG, JPG, WEBP), <strong>Word (.docx)</strong>, and <strong>TXT</strong>.
              <br />
              You can select both the portal form and the annexure together.
            </p>

            <div className="qr-upload-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload GST Notice
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => cameraInputRef.current?.click()}
              >
                Scan with Camera
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          <div className="qr-features-grid">
            <div className="qr-feature-card">
              <div className="qr-feature-title">1. Lens-Style Local OCR</div>
              <p className="muted">
                Reads scanned PDFs and photos on your machine with confidence-coded text overlays—client identifiers never leave locally during OCR.
              </p>
            </div>
            <div className="qr-feature-card">
              <div className="qr-feature-title">2. Smart GST Questions</div>
              <p className="muted">
                Checks missing fields, low-confidence scan figures, ITC mismatch causes, DRC-03 payments, and Personal Hearing u/s 75(4).
              </p>
            </div>
            <div className="qr-feature-card">
              <div className="qr-feature-title">3. Indian GST Act Reply Pack</div>
              <p className="muted">
                Four-counsel adversarial review produces a formal reply with verified citations, issue-wise analysis, and Word (.docx) export.
              </p>
            </div>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section className="qr-review-grid">
          <div className="qr-lens-col">
            <LensScanner
              pages={extractResult?.lens_pages || []}
              scanning={scanning}
              localPreviewUrl={localPreviewUrl}
              extractedText={extractResult?.text || ''}
            />
            {uploadedNames.length > 0 && (
              <div className="qr-file-pills">
                {uploadedNames.map((name) => (
                  <span key={name} className="qr-file-pill">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="qr-qa-col">
            {scanning ? (
              <div className="card card-pad qr-scanning-card">
                <div className="spinner" />
                <div>
                  <strong>Reading notice &amp; extracting GST fields…</strong>
                  <p className="muted">
                    Running local OCR, defect segmentation, and statutory field detection.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {extractResult?.warnings?.length > 0 && (
                  <div className="alert alert-warning qr-warnings">
                    <strong>Review notes:</strong>
                    <ul>
                      {extractResult.warnings.slice(0, 4).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="card card-pad qr-summary-card">
                  <div className="qr-card-header">
                    <h3>Extracted Notice Summary</h3>
                    {extractResult?.scanned && (
                      <span className="badge badge-warning">OCR Read — Verify Figures</span>
                    )}
                  </div>

                  <div className="qr-fields-grid">
                    <label className="qr-field">
                      <span>GSTIN</span>
                      <input
                        className="input"
                        value={form.gstin || ''}
                        onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                        placeholder="e.g. 29ABCDE1234F1Z5"
                      />
                    </label>
                    <label className="qr-field">
                      <span>State / Jurisdiction *</span>
                      <input
                        className="input"
                        value={form.state || ''}
                        onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                        placeholder="e.g. Karnataka"
                      />
                    </label>
                    <label className="qr-field">
                      <span>Notice Type</span>
                      <input
                        className="input"
                        value={form.notice_type || ''}
                        onChange={(e) => setForm((f) => ({ ...f, notice_type: e.target.value }))}
                      />
                    </label>
                    <label className="qr-field">
                      <span>Section Invoked</span>
                      <input
                        className="input"
                        value={form.section_invoked || ''}
                        onChange={(e) => setForm((f) => ({ ...f, section_invoked: e.target.value }))}
                        placeholder="e.g. Section 73 / 61"
                      />
                    </label>
                    <label className="qr-field">
                      <span>Tax Period</span>
                      <input
                        className="input"
                        value={form.tax_period || ''}
                        onChange={(e) => setForm((f) => ({ ...f, tax_period: e.target.value }))}
                        placeholder="e.g. FY 2020-21"
                      />
                    </label>
                    <label className="qr-field">
                      <span>Reply Due Date</span>
                      <input
                        className="input"
                        value={form.reply_due_date || ''}
                        onChange={(e) => setForm((f) => ({ ...f, reply_due_date: e.target.value }))}
                        placeholder="YYYY-MM-DD"
                      />
                    </label>
                    <label className="qr-field">
                      <span>Disputed Amount (INR)</span>
                      <input
                        className="input"
                        value={form.amount_disputed ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, amount_disputed: e.target.value }))}
                        placeholder="0.00"
                      />
                    </label>
                    <label className="qr-field">
                      <span>Reference No.</span>
                      <input
                        className="input"
                        value={form.reference_number || ''}
                        onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
                      />
                    </label>
                  </div>

                  {form.defects?.length > 0 && (
                    <div className="qr-defects-preview">
                      <strong>{form.defects.length} Defect Limb(s) Detected:</strong>
                      <ul>
                        {form.defects.slice(0, 5).map((d, i) => (
                          <li key={i}>
                            <span>{d.heading || `Defect ${i + 1}`}</span>
                            {d.amount != null && (
                              <span className="mono">{formatCurrency(d.amount)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="qr-recon-row">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={reconciling}
                      onClick={() => reconInputRef.current?.click()}
                    >
                      {reconciling
                        ? 'Reading Excel…'
                        : recon
                        ? '✓ 2A/2B-vs-3B Reconciliation Attached'
                        : '+ Attach 2A/2B-vs-3B Reconciliation (.xlsx)'}
                    </button>
                    <input
                      ref={reconInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      hidden
                      onChange={(e) => handleReconUpload(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="qr-questions-block">
                  <h3>Quick Questions Before Drafting</h3>
                  <ClarifyingQuestions
                    questions={extractResult?.questions || []}
                    answers={answers}
                    onAnswer={handleAnswer}
                  />
                </div>

                <div className="qr-action-bar">
                  <div className="qr-tier-select">
                    <label>
                      <span>Mode:</span>
                      <select
                        className="input"
                        value={tier}
                        onChange={(e) => setTier(e.target.value)}
                      >
                        {(config?.tiers || [
                          { key: 'draft', label: 'Draft (Anonymised)' },
                          { key: 'pro', label: 'Pro (Zero-retention)' },
                        ]).map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label || t.key}
                          </option>
                        ))}
                      </select>
                    </label>
                    {estimate?.estimated_inr != null && (
                      <span className="muted">Est. ~₹{estimate.estimated_inr}</span>
                    )}
                  </div>

                  <div className="qr-action-buttons">
                    <button type="button" className="btn btn-ghost" onClick={resetAll}>
                      Start Over
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      onClick={handleGenerate}
                    >
                      Generate GST Act Response →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {step === 'generate' && (
        <section className="qr-generate-section">
          <div className="card card-pad qr-progress-card">
            <div className="qr-progress-header">
              <div>
                <h3>
                  {running
                    ? 'Drafting Your GST Notice Response…'
                    : determinationText
                    ? 'GST Notice Response Ready'
                    : 'Response Generation Incomplete'}
                </h3>
                <p className="muted">
                  {running
                    ? 'Four specialist counsel are analysing the notice and verifying statutory citations.'
                    : determinationText
                    ? 'Review the draft reply below, copy it, or export the formatted Word reply pack.'
                    : error || 'No draft reply was received from the panel. Check your OpenRouter API key/credits and retry.'}
                </p>
              </div>
              <div className="qr-result-actions">
                {!running && !determinationText && (
                  <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                    Retry Generation
                  </button>
                )}
                {!running && determinationText && (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={copyDraftReply}>
                      {copiedReply ? 'Copied!' : 'Copy Reply'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        matterId
                          ? api.downloadMatter(matterId, null, 'reply')
                          : api.downloadInlineReport({
                              intake: buildIntakePayload(),
                              result: panelResult,
                              domain: 'gst',
                              tier,
                              document: 'reply',
                            })
                      }
                    >
                      Download Word (.docx)
                    </button>
                    {matterId && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onOpenMatter?.(matterId)}
                      >
                        Open Full Matter
                      </button>
                    )}
                  </>
                )}
                <button type="button" className="btn btn-ghost" onClick={resetAll}>
                  New Notice
                </button>
              </div>
            </div>

            <div className="qr-progressbar-wrap" aria-live="polite">
              <div className="qr-progressbar-meta">
                <span>
                  {running
                    ? stageStatus.stage1 === 'running'
                      ? `Stage 1/4: Counsel Opening Analyses (${counselDoneCount}/4 complete)`
                      : stageStatus.stage2 === 'running'
                      ? 'Stage 2/4: Cross-Examination'
                      : stageStatus.stage3 === 'running'
                      ? 'Stage 3/4: Chairman Determination'
                      : stageStatus.verification === 'running'
                      ? 'Stage 4/4: Citation Verification'
                      : 'Connecting to compliance panel…'
                    : determinationText
                    ? 'Completed (4/4 stages)'
                    : 'Stopped before completion'}
                </span>
                <span className="qr-progressbar-stats">
                  {progressPercent}% · {elapsedSeconds}s
                </span>
              </div>
              <div
                className="qr-progressbar-track"
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`qr-progressbar-fill ${running ? 'active' : ''} ${
                    !running && !determinationText ? 'error' : ''
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="qr-stages-row">
              {STAGES.map((st) => {
                const status = stageStatus[st.key] || 'pending';
                const desc =
                  st.key === 'stage1' && status === 'running' && counselDoneCount > 0
                    ? `${counselDoneCount}/4 counsel analyses complete…`
                    : st.desc;
                return (
                  <div key={st.key} className={`qr-stage-pill ${status}`}>
                    <span className="qr-stage-indicator">
                      {status === 'done'
                        ? '✓'
                        : status === 'running'
                        ? '●'
                        : status === 'error'
                        ? '✕'
                        : '○'}
                    </span>
                    <div>
                      <div className="qr-stage-name">{st.label}</div>
                      <div className="qr-stage-desc">{desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {determinationText && (
            <div className="card card-pad qr-reply-card">
              <div className="qr-reply-header">
                <h3>Draft Statutory Reply (Indian GST Act)</h3>
                {form.gstin && <span className="badge">{form.gstin}</span>}
              </div>
              <div className="qr-markdown">
                <ReactMarkdown>{determinationText}</ReactMarkdown>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
