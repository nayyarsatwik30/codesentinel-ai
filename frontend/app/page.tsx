'use client';

import { useState, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

type Issue = {
  id: string;
  filePath: string;
  line: number;
  ruleId: string;
  message: string;
  codeSnippet: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  explanation: string | null;
  suggestedFix: string | null;
};

type Scan = {
  id: string;
  repoUrl: string;
  status: 'PENDING' | 'CLONING' | 'ANALYZING' | 'EXPLAINING' | 'DONE' | 'FAILED';
  error?: string | null;
  issues: Issue[];
};

const severityOrder: Record<Issue['severity'], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const severityColor: Record<Issue['severity'], string> = {
  CRITICAL: '#ff5c5c',
  HIGH: '#ff9f43',
  MEDIUM: '#f7d154',
  LOW: '#6fcf97',
  INFO: '#6fa8dc',
};

const severities: Issue['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const steps = ['Clone', 'Analyze', 'Explain', 'Done'];

const stepIndex: Record<Scan['status'], number> = {
  PENDING: 0,
  CLONING: 0,
  ANALYZING: 1,
  EXPLAINING: 2,
  DONE: 3,
  FAILED: -1,
};

const exampleRepos = [
  'https://github.com/expressjs/express',
  'https://github.com/sindresorhus/is-odd',
];

const howItWorks = [
  { title: 'Static analysis detects issues', body: 'ESLint deterministically flags real problems.' },
  { title: 'LLM explains and prioritizes', body: 'Each finding gets a plain-language reason and a fix.' },
  { title: 'Review a ranked report', body: 'Issues are sorted by severity so you fix what matters first.' },
];

const techStack = ['Next.js', 'NestJS', 'PostgreSQL', 'Prisma', 'ESLint', 'Anthropic API'];

const chipStyle = {
  padding: '4px 12px',
  borderRadius: 999,
  border: '1px solid #2a3542',
  background: '#121922',
  color: '#9fb0c0',
  fontSize: 12,
} as const;

export default function Home() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/expressjs/express');
  const [filter, setFilter] = useState<Issue['severity'] | 'ALL'>('ALL');
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startScan = async () => {
    setErrorMsg(null);
    setScan(null);
    setFilter('ALL');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      });
      if (!res.ok) throw new Error(`Failed to start scan (${res.status})`);
      const { id } = await res.json();

      pollRef.current = setInterval(async () => {
        const r = await fetch(`${API_BASE}/scan/${id}`);
        if (!r.ok) return;
        const data: Scan = await r.json();
        setScan(data);
        if (data.status === 'DONE' || data.status === 'FAILED') {
          stopPolling();
          setLoading(false);
        }
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const sortedIssues = scan?.issues
    ? [...scan.issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    : [];

  const counts = severities.reduce(
    (acc, s) => ({ ...acc, [s]: sortedIssues.filter((i) => i.severity === s).length }),
    {} as Record<Issue['severity'], number>,
  );
  const visibleIssues = filter === 'ALL' ? sortedIssues : sortedIssues.filter((i) => i.severity === filter);
  const currentStep = scan ? stepIndex[scan.status] : loading ? 0 : -2;

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>CodeSentinel AI</h1>
      <p style={{ color: '#9fb0c0', marginTop: 0, marginBottom: 28 }}>
        Deterministic static analysis detects issues. The LLM only explains, prioritizes, and
        suggests fixes — it never decides what counts as a problem.
      </p>

      <div style={{ display: 'flex', gap: 12 }}>
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #2a3542',
            background: '#121922',
            color: '#e7edf3',
          }}
        />
        <button
          onClick={startScan}
          disabled={loading}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: loading ? '#334' : '#3b82f6',
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Scanning…' : 'Scan repo'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <span style={{ color: '#6b7c8d', fontSize: 12 }}>Try:</span>
        {exampleRepos.map((url) => (
          <button
            key={url}
            onClick={() => setRepoUrl(url)}
            style={{ ...chipStyle, cursor: 'pointer' }}
          >
            {url.replace('https://github.com/', '')}
          </button>
        ))}
      </div>

      {errorMsg && <p style={{ color: '#ff8080', marginTop: 16 }}>{errorMsg}</p>}

      {!scan && !loading && (
        <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}>
          {howItWorks.map((s, i) => (
            <div
              key={s.title}
              style={{
                flex: '1 1 240px',
                border: '1px solid #2a3542',
                borderRadius: 10,
                padding: 16,
                background: '#121922',
              }}
            >
              <div style={{ color: '#3b82f6', fontWeight: 700, fontSize: 12, marginBottom: 6 }}>STEP {i + 1}</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
              <div style={{ color: '#9fb0c0', fontSize: 14 }}>{s.body}</div>
            </div>
          ))}
        </div>
      )}

      {(scan || loading) && (
        <div style={{ marginTop: 24 }}>
          {scan?.status === 'FAILED' ? (
            <div
              style={{
                border: '1px solid #ff5c5c',
                borderRadius: 10,
                padding: 16,
                background: '#2a1517',
                color: '#ff8080',
              }}
            >
              <strong>Scan failed.</strong> {scan.error || 'Unknown error.'}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {steps.map((label, i) => {
                const done = i < currentStep || currentStep === 3;
                const active = i === currentStep && currentStep !== 3;
                const color = done ? '#6fcf97' : active ? '#3b82f6' : '#6b7c8d';
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < 3 ? 1 : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          border: `2px solid ${color}`,
                          background: done ? color : 'transparent',
                          color: done ? '#0b0f14' : color,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {done ? '✓' : i + 1}
                      </span>
                      <span style={{ fontWeight: active ? 700 : 500 }}>{label}</span>
                    </div>
                    {i < 3 && <div style={{ flex: 1, height: 2, background: done ? '#6fcf97' : '#2a3542' }} />}
                  </div>
                );
              })}
            </div>
          )}

          {scan?.status === 'DONE' && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  margin: '24px 0 16px',
                  padding: '12px 16px',
                  border: '1px solid #2a3542',
                  borderRadius: 10,
                  background: '#121922',
                }}
              >
                <strong style={{ marginRight: 8 }}>{sortedIssues.length} issue(s) found</strong>
                {severities.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: severityColor[s],
                      border: `1px solid ${severityColor[s]}`,
                    }}
                  >
                    {s} {counts[s]}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {(['ALL', ...severities] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    style={{
                      ...chipStyle,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      ...(filter === s ? { background: '#3b82f6', borderColor: '#3b82f6', color: 'white' } : {}),
                    }}
                  >
                    {s.toLowerCase()}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visibleIssues.map((issue) => (
                  <div
                    key={issue.id}
                    style={{
                      border: '1px solid #2a3542',
                      borderRadius: 10,
                      padding: 16,
                      background: '#121922',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <code style={{ color: '#9fb0c0' }}>
                        {issue.filePath}:{issue.line} — {issue.ruleId}
                      </code>
                      <span
                        style={{
                          color: severityColor[issue.severity],
                          fontWeight: 600,
                          fontSize: 12,
                          letterSpacing: 0.5,
                        }}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    <pre
                      style={{
                        background: '#0b0f14',
                        padding: 10,
                        borderRadius: 6,
                        overflowX: 'auto',
                        fontSize: 13,
                        marginTop: 10,
                      }}
                    >
                      {issue.codeSnippet}
                    </pre>
                    <p style={{ marginBottom: 4 }}>
                      <strong>Why it matters: </strong>
                      {issue.explanation}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Suggested fix: </strong>
                      {issue.suggestedFix}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <footer
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: 56,
          paddingTop: 24,
          borderTop: '1px solid #2a3542',
        }}
      >
        {techStack.map((t) => (
          <span key={t} style={chipStyle}>
            {t}
          </span>
        ))}
      </footer>
    </main>
  );
}
