import React, { useState } from "react";
import { authApi } from "../services/api";
import { useAuth } from "../auth/AuthContext";
import { Modal, useToast } from "./ui";

function Field({ label, value }) {
  return (
    <div>
      <div className="field-hint" style={{ marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, fontSize: 11.5 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, color: "var(--text-main)" }}>{value || "—"}</div>
    </div>
  );
}

function ActionRow({ title, desc, button, danger = false, onClick = null, isLast = false }) {
  const disabled = !onClick;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: 16, paddingBottom: isLast ? 0 : 16, borderTop: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: danger && !disabled ? "var(--red)" : "var(--text-main)" }}>{title}</div>
        <div className="field-hint" style={{ marginTop: 2 }}>{desc}</div>
      </div>
      <button type="button" className={`btn btn-sm ${danger ? "btn-danger-ghost" : "btn-secondary"}`} disabled={disabled} onClick={onClick || undefined}>
        {button}
      </button>
    </div>
  );
}

export default function AccountTab({ user, logout }) {
  const { deleteAccount } = useAuth();
  const toast = useToast();

  // Change password modal state
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErr, setPwErr] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Delete account modal state
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delErr, setDelErr] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  if (!user) return null;

  const openPwModal = () => {
    setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwErr(null); setPwOpen(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwErr(null);
    if (!currentPw || !newPw) { setPwErr("Please fill in both your current and new password."); return; }
    if (newPw !== confirmPw) { setPwErr("New passwords do not match."); return; }
    setPwBusy(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setPwOpen(false);
      toast("Password updated.", "ok");
    } catch (err) {
      setPwErr(err.message || "Could not change password.");
    } finally {
      setPwBusy(false);
    }
  };

  const openDelModal = () => {
    setDelPw(""); setDelErr(null); setDelOpen(true);
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDelErr(null);
    if (!delPw) { setDelErr("Please enter your password to confirm."); return; }
    setDelBusy(true);
    try {
      await deleteAccount(delPw);
    } catch (err) {
      setDelErr(err.message || "Could not delete account.");
      setDelBusy(false);
    }
  };

  return (
    <div className="account-layout">
      <div className="card account-details-card">
        <div className="card-head" style={{ marginBottom: 14 }}>
          <div className="card-title">Your details</div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: "50%", background: "linear-gradient(155deg, var(--primary), var(--blush))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700, boxShadow: "0 3px 10px rgba(107, 78, 142, 0.24)" }}>
            {user.name ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "?"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-main)", lineHeight: 1.25 }}>{user.name}</div>
            <div className="field-hint" style={{ marginTop: 2 }}>{user.email}</div>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 16, paddingTop: 16 }}>
          <Field label="Name" value={user.name} />
          <Field label="Email address" value={user.email} />
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ marginBottom: 12 }}>
          <div className="card-title">Account actions</div>
        </div>
        <ActionRow title="Password" desc="Change your password" button="Change password" onClick={openPwModal} />
        <ActionRow title="Sign out" desc="End your session on this device" button="Sign out" onClick={logout} />
        <ActionRow title="Delete account" desc="Remove your account and saved runs" button="Delete" danger isLast onClick={openDelModal} />
      </div>

      {/* Change Password Modal */}
      <Modal open={pwOpen} onClose={() => !pwBusy && setPwOpen(false)} title="Change password" desc="Enter your current password and choose a new one." maxWidth={440} labelledBy="change-pw-title">
        <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pwErr && <div className="alert-danger">{pwErr}</div>}
          <div>
            <label className="field-label" htmlFor="cur-pw">Current password</label>
            <input id="cur-pw" type="password" className="field-input" style={{ width: "100%" }} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="field-label" htmlFor="new-pw">New password</label>
            <input id="new-pw" type="password" className="field-input" style={{ width: "100%" }} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
          </div>
          <div>
            <label className="field-label" htmlFor="confirm-pw">Confirm new password</label>
            <input id="confirm-pw" type="password" className="field-input" style={{ width: "100%" }} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={pwBusy} onClick={() => setPwOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>{pwBusy ? "Saving…" : "Save password"}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Account Modal */}
      <Modal open={delOpen} onClose={() => !delBusy && setDelOpen(false)} title="Delete account" desc="This permanently removes your account, saved runs, and studies. Enter your password to confirm." maxWidth={440} labelledBy="del-acc-title">
        <form onSubmit={handleDeleteAccount} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {delErr && <div className="alert-danger">{delErr}</div>}
          <div>
            <label className="field-label" htmlFor="del-pw">Password</label>
            <input id="del-pw" type="password" className="field-input" style={{ width: "100%" }} value={delPw} onChange={(e) => setDelPw(e.target.value)} required autoFocus />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={delBusy} onClick={() => setDelOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={delBusy}>{delBusy ? "Deleting…" : "Delete account"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
