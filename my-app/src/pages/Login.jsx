import { useState } from "react";
import api from "../services/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/api/v1/auth/login", { email, password });
      const { access_token, refresh_token } = response.data;
      localStorage.setItem("token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      window.location.href = "/dashboard";
    } catch (err) {
      const msg = err?.response?.data?.detail || "Login failed. Check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div style={styles.page}>
      {/* Left branding panel */}
      <div style={styles.leftPanel}>
        <div style={styles.logoRow}>
          <div style={styles.logoBox}>⬡</div>
          <div>
            <div style={styles.brandName}>GymOS</div>
            <div style={styles.brandSub}>MANAGEMENT SYSTEM</div>
          </div>
        </div>

        <div style={styles.heroText}>
          <h1 style={styles.heroTitle}>COMMAND<br />CENTER</h1>
          <p style={styles.heroDesc}>Manage members, trainers, billing, and reports — all in one place.</p>
        </div>

        <div style={styles.pillsRow}>
          {["Members", "Trainers", "Billing", "Reports"].map((label) => (
            <div key={label} style={styles.pill}>{label}</div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div style={styles.rightPanel}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Welcome back</h2>
          <p style={styles.cardSub}>Sign in to your admin account</p>

          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.field}>
            <label style={styles.label}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="admin@gym.com"
              style={styles.input}
              onFocus={(e) => {
                e.target.style.borderColor = "#4F46E5";
                e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#ddd6fe";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              style={styles.input}
              onFocus={(e) => {
                e.target.style.borderColor = "#4F46E5";
                e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.15)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#ddd6fe";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.75 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.backgroundColor = "#4338CA"; }}
            onMouseLeave={(e) => { if (!loading) e.target.style.backgroundColor = "#4F46E5"; }}
          >
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    backgroundColor: "#eef0fb",
  },
  leftPanel: {
    flex: 1,
    background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4F46E5 100%)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "48px 52px",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  logoBox: {
    width: "42px",
    height: "42px",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    color: "#fff",
  },
  brandName: {
    fontSize: "20px",
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: "-0.5px",
    lineHeight: 1.1,
  },
  brandSub: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "2px",
    marginTop: "2px",
  },
  heroText: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "16px",
  },
  heroTitle: {
    fontSize: "56px",
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: "-2px",
    lineHeight: 1.05,
    margin: 0,
  },
  heroDesc: {
    fontSize: "15px",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 1.6,
    maxWidth: "320px",
    margin: 0,
  },
  pillsRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "rgba(255,255,255,0.8)",
    borderRadius: "20px",
    padding: "6px 16px",
    fontSize: "12px",
    letterSpacing: "0.5px",
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef0fb",
    padding: "40px",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "40px",
    boxShadow: "0 4px 40px rgba(79,70,229,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  cardTitle: {
    fontSize: "28px",
    fontWeight: "800",
    color: "#1e1b4b",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  cardSub: {
    fontSize: "14px",
    color: "#8b87a8",
    margin: 0,
    marginTop: "-12px",
  },
  errorBox: {
    backgroundColor: "#fff1f2",
    border: "1px solid #fda4af",
    color: "#be123c",
    padding: "12px 16px",
    borderRadius: "10px",
    fontSize: "13px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "11px",
    color: "#6d6a85",
    letterSpacing: "1.5px",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#f5f4ff",
    border: "1.5px solid #ddd6fe",
    borderRadius: "10px",
    padding: "13px 16px",
    fontSize: "15px",
    color: "#1e1b4b",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    fontFamily: "inherit",
  },
  button: {
    backgroundColor: "#4F46E5",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    padding: "15px",
    fontSize: "15px",
    fontWeight: "700",
    transition: "background-color 0.2s",
    marginTop: "4px",
    fontFamily: "inherit",
    letterSpacing: "0.3px",
  },
};
