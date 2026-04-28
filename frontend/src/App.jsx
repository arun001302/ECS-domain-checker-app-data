import { useState } from "react";

// ── Styles ────────────────────────────────────────────────────────────────
const styles = {
  container: {
    maxWidth: "780px",
    margin: "0 auto",
    padding: "48px 24px"
  },
  header: {
    textAlign: "center",
    marginBottom: "40px"
  },
  title: {
    fontSize: "2rem",
    fontWeight: "700",
    color: "#f8fafc",
    marginBottom: "8px"
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "0.95rem"
  },
  searchRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "36px"
  },
  input: {
    flex: 1,
    padding: "14px 18px",
    borderRadius: "10px",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#f1f5f9",
    fontSize: "1rem",
    outline: "none"
  },
  button: {
    padding: "14px 28px",
    borderRadius: "10px",
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontWeight: "600",
    fontSize: "1rem",
    cursor: "pointer"
  },
  buttonDisabled: {
    background: "#1e40af",
    cursor: "not-allowed"
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "16px"
  },
  cardTitle: {
    fontSize: "0.75rem",
    fontWeight: "700",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: "16px"
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #0f172a"
  },
  label: { color: "#94a3b8", fontSize: "0.9rem" },
  value: { color: "#f1f5f9", fontSize: "0.9rem", fontWeight: "500" },
  badge: {
    padding: "3px 10px",
    borderRadius: "999px",
    fontSize: "0.78rem",
    fontWeight: "600"
  },
  error: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    borderRadius: "10px",
    padding: "16px 20px",
    color: "#fca5a5"
  },
  overallBar: {
    borderRadius: "12px",
    padding: "20px 24px",
    marginBottom: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }
};

// ── Helper Components ─────────────────────────────────────────────────────
function Badge({ ok, text }) {
  return (
    <span style={{
      ...styles.badge,
      background: ok ? "#052e16" : "#450a0a",
      color: ok ? "#4ade80" : "#f87171"
    }}>
      {text}
    </span>
  );
}

function Row({ label, value, badge }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      {badge !== undefined ? badge : <span style={styles.value}>{value ?? "—"}</span>}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleCheck() {
    if (!domain.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      // In local dev: Vite proxy forwards this to Flask on :5000
      // In ECS production: ALB routes /api/* to the backend target group
      const res = await fetch(`/api/check?domain=${encodeURIComponent(domain.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Could not reach the API. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleCheck();
  }

  const https = result?.http?.https;
  const http = result?.http?.http;
  const ssl = result?.ssl;
  const dns = result?.dns;
  const isHealthy = result?.overall_status === "healthy";

  return (
    <div style={styles.container}>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>🌐 Domain Health Checker</div>
        <div style={styles.subtitle}>
          DNS · SSL · HTTP reachability — powered by ECS Fargate
        </div>
      </div>

      {/* Search */}
      <div style={styles.searchRow}>
        <input
          style={styles.input}
          type="text"
          placeholder="e.g. godaddy.com"
          value={domain}
          onChange={e => setDomain(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
          onClick={handleCheck}
          disabled={loading}
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </div>

      {/* Error */}
      {error && <div style={styles.error}>⚠️ {error}</div>}

      {/* Results */}
      {result && (
        <>
          {/* Overall Status Bar */}
          <div style={{
            ...styles.overallBar,
            background: isHealthy ? "#052e16" : "#450a0a",
            border: `1px solid ${isHealthy ? "#166534" : "#7f1d1d"}`
          }}>
            <div>
              <div style={{ fontWeight: "700", fontSize: "1.1rem", color: isHealthy ? "#4ade80" : "#f87171" }}>
                {isHealthy ? "✓ Healthy" : "⚠ Degraded"} — {result.domain}
              </div>
              <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "4px" }}>
                Checked at {new Date(result.checked_at).toLocaleTimeString()} · {result.total_check_time_ms}ms total
              </div>
            </div>
            <Badge ok={isHealthy} text={isHealthy ? "PASSING" : "ISSUES FOUND"} />
          </div>

          {/* DNS Card */}
          <Card title="DNS Resolution">
            <Row label="Status" badge={<Badge ok={dns?.status === "resolved"} text={dns?.status?.toUpperCase()} />} />
            <Row label="IP Addresses" value={dns?.ip_addresses?.join(", ") || "None"} />
            <Row label="Record Count" value={dns?.record_count} />
          </Card>

          {/* SSL Card */}
          <Card title="SSL Certificate">
            <Row label="Valid" badge={<Badge ok={ssl?.valid} text={ssl?.valid ? "VALID" : "INVALID"} />} />
            {ssl?.valid ? (
              <>
                <Row label="Issuer" value={ssl?.issuer} />
                <Row label="Expiry Date" value={ssl?.expiry_date} />
                <Row
                  label="Days Remaining"
                  badge={<Badge ok={(ssl?.days_remaining ?? 0) > 14} text={`${ssl?.days_remaining} days`} />}
                />
              </>
            ) : (
              <Row label="Error" value={ssl?.error} />
            )}
          </Card>

          {/* HTTPS Card */}
          <Card title="HTTPS Reachability">
            <Row label="Reachable" badge={<Badge ok={https?.reachable} text={https?.reachable ? "YES" : "NO"} />} />
            {https?.reachable && (
              <>
                <Row label="Status Code" value={https?.status_code} />
                <Row label="Latency" value={`${https?.latency_ms} ms`} />
                <Row label="Redirected" value={https?.redirected ? `Yes → ${https?.final_url}` : "No"} />
              </>
            )}
            {!https?.reachable && <Row label="Error" value={https?.error} />}
          </Card>

          {/* HTTP Card */}
          <Card title="HTTP Reachability">
            <Row label="Reachable" badge={<Badge ok={http?.reachable} text={http?.reachable ? "YES" : "NO"} />} />
            {http?.reachable && (
              <>
                <Row label="Status Code" value={http?.status_code} />
                <Row label="Latency" value={`${http?.latency_ms} ms`} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
