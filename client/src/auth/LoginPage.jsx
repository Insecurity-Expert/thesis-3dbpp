// client/src/auth/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import logoImg from "../logo.png";

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email || !password) {
      setErr("Please fill in all fields.");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
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

        <h3 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-main)", textAlign: "left", marginBottom: "4px" }}>Welcome back</h3>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", textAlign: "left", marginBottom: "28px" }}>Sign in to continue to the tool</p>
        
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
            <label className="form-label">Email address</label>
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

          <div className="form-group" style={{ marginBottom: "28px" }}>
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

          <div style={{ textAlign: "right", marginTop: "-18px", marginBottom: "20px" }}>
            <Link to="/forgot-password" style={{ color: "var(--primary)", fontSize: "12.5px", fontWeight: "600", textDecoration: "none" }}>Forgot password?</Link>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={{ marginTop: "28px", fontSize: "13px", color: "var(--text-muted)", textAlign: "center" }}>
          Don't have an account? <Link to="/register" style={{ color: "var(--primary)", fontWeight: "700", textDecoration: "none" }}>Register</Link>
        </p>
      </div>
    </div>
  );
}