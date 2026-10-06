// client/src/auth/RegisterPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { authApi } from "../services/api";
import logoImg from "../logo.png";

export default function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [questions, setQuestions] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    authApi.recoveryQuestions().then((r) => setQuestions(r.questions || [])).catch(() => setQuestions([]));
  }, []);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email || !name || !password) {
      setErr("Please fill in all fields.");
      return;
    }
    if (!question || !answer.trim()) {
      setErr("Choose a recovery question and type your answer. It lets you reset your password if you forget it.");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      await register({ email, name, password, recovery_question: question, recovery_answer: answer });
      nav("/app");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        {/* Mockup styled Header with Icon */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "30px" }}>
          <img src={logoImg} alt="STACKR Logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "contain" }} />
          <div style={{ textAlign: "left" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main)", lineHeight: 1.1 }}>STACKR</h2>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: "600" }}>3D Bin Packing Optimizer</span>
          </div>
        </div>

        <h3 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-main)", textAlign: "left", marginBottom: "4px" }}>Create account</h3>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", textAlign: "left", marginBottom: "28px" }}>Sign up to start optimizing your containers</p>

        {err && (
          <div style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid var(--red)",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "var(--red)",
            fontSize: "13px",
            marginBottom: "20px",
            textAlign: "left"
          }}>
            ⚠ {err}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div className="input-container">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                className="form-input"
                placeholder="John Doe"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-container">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
              <input
                className="form-input"
                placeholder="researcher@pup.edu.ph"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "20px" }}>
            <label className="form-label">Password</label>
            <div className="input-container">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                className="form-input"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-question">Recovery question</label>
            <select id="reg-question" className="form-input" style={{ paddingLeft: 12 }} value={question}
                    onChange={(e) => setQuestion(e.target.value)} required>
              <option value="">Choose a question…</option>
              {questions.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: "20px" }}>
            <label className="form-label" htmlFor="reg-answer">Answer</label>
            <input id="reg-answer" className="form-input" style={{ paddingLeft: 12 }} type="text" autoComplete="off"
                   value={answer} onChange={(e) => setAnswer(e.target.value)} required />
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6, textAlign: "left" }}>
              Used only for "Forgot password". Capital letters and extra spaces don't matter.
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ marginTop: "28px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--primary)", fontWeight: "700", textDecoration: "none" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}