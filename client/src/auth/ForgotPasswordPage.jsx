// client/src/auth/ForgotPasswordPage.jsx — reset a password with the recovery
// question chosen at registration. Accounts made before this existed have no
// question; the page then says to ask the administrator (server/reset-password.js).
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../services/api";
import logoImg from "../logo.png";

const errBox = {
  background: "rgba(239, 68, 68, 0.08)", border: "1px solid var(--red)", borderRadius: "8px",
  padding: "10px 14px", color: "var(--red)", fontSize: "13px", marginBottom: "20px", textAlign: "left",
};
const field = { paddingLeft: 12 };

export default function ForgotPasswordPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function findQuestion(e) {
    e.preventDefault();
    if (!email.trim()) { setErr("Type the email address of your account."); return; }
    setErr(""); setLoading(true);
    try {
      const r = await authApi.forgotQuestion(email);
      setQuestion(r.question);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  async function reset(e) {
    e.preventDefault();
    if (!answer.trim() || !pw) { setErr("Type your answer and a new password."); return; }
    if (pw !== pw2) { setErr("The two new passwords are not the same."); return; }
    setErr(""); setLoading(true);
    try {
      await authApi.forgotReset(email, answer, pw);
      setDone(true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "30px" }}>
          <img src={logoImg} alt="STACKR Logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "contain" }} />
          <div style={{ textAlign: "left" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main)", lineHeight: 1.1 }}>STACKR</h2>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: "600" }}>3D Bin Packing Optimizer</span>
          </div>
        </div>

        <h3 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-main)", textAlign: "left", marginBottom: "4px" }}>Reset your password</h3>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", textAlign: "left", marginBottom: "28px" }}>
          {done ? "Your password has been changed." : question ? "Answer your recovery question and choose a new password." : "Type the email address you registered with."}
        </p>

        {err && <div style={errBox} role="alert">⚠ {err}</div>}

        {done ? (
          <button type="button" className="btn-primary" onClick={() => nav("/login")}>Sign in</button>
        ) : !question ? (
          <form onSubmit={findQuestion}>
            <div className="form-group" style={{ marginBottom: "28px" }}>
              <label className="form-label" htmlFor="fp-email">Email address</label>
              <input id="fp-email" className="form-input" style={field} type="email" value={email}
                     onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Checking..." : "Continue"}</button>
          </form>
        ) : (
          <form onSubmit={reset}>
            <div className="form-group">
              <span className="form-label">Recovery question</span>
              <div style={{ fontSize: 14, color: "var(--text-main)", textAlign: "left", fontWeight: 600 }}>{question}</div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="fp-answer">Answer</label>
              <input id="fp-answer" className="form-input" style={field} type="text" autoComplete="off" value={answer}
                     onChange={(e) => setAnswer(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="fp-pw">New password</label>
              <input id="fp-pw" className="form-input" style={field} type="password" value={pw}
                     onChange={(e) => setPw(e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: "28px" }}>
              <label className="form-label" htmlFor="fp-pw2">New password again</label>
              <input id="fp-pw2" className="form-input" style={field} type="password" value={pw2}
                     onChange={(e) => setPw2(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Saving..." : "Change password"}</button>
          </form>
        )}

        <p style={{ marginTop: "28px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
          <Link to="/login" style={{ color: "var(--primary)", fontWeight: "700", textDecoration: "none" }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
