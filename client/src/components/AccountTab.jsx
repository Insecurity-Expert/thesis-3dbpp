import React from "react";
import ThingsToKnow from "./ThingsToKnow";

// Display-only account page. Layout follows the groupmate fork's AccountTab;
// none of its logic is kept (it PUT to /api/auth/me, which this server does
// not have). Actions that are not built yet are visibly disabled — no form
// here pretends to save anything.

const LATER = "Coming in a later version";

function Field({ label, value }) {
  return (
    <div>
      <div className="field-hint" style={{ marginTop: 0 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{value || "—"}</div>
    </div>
  );
}

function ActionRow({ title, desc, button, danger = false, onClick = null }) {
  const disabled = !onClick;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0", borderTop: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontWeight: 600, color: danger && !disabled ? "var(--red)" : "var(--text-main)" }}>{title}</div>
        <div className="field-hint" style={{ marginTop: 2 }}>{disabled ? `${desc} — ${LATER.toLowerCase()}.` : desc}</div>
      </div>
      <button type="button" className={`btn btn-sm ${danger ? "btn-danger-ghost" : "btn-secondary"}`} disabled={disabled} onClick={onClick || undefined} title={disabled ? LATER : undefined}>
        {button}
      </button>
    </div>
  );
}

export default function AccountTab({ user, logout, studies, result }) {
  if (!user) return null;
  const joined = user.created_at ? new Date(user.created_at) : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Your details</div>
              <div className="card-desc">As entered when the account was created. Editing is {LATER.toLowerCase()}.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(155deg, var(--primary), var(--blush))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
              {user.name ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "?"}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{user.name}</div>
              <div className="field-hint" style={{ marginTop: 2 }}>{user.email}</div>
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: 14 }}>
            <Field label="Name" value={user.name} />
            <Field label="Email address" value={user.email} />
            <Field label="I am a…" value={user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : null} />
            <Field label="Account created" value={joined && !Number.isNaN(joined.getTime()) ? joined.toLocaleDateString() : null} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div><div className="card-title">Account actions</div></div></div>
          <ActionRow title="Password" desc="Change your password" button="Change password" />
          <ActionRow title="Download the app" desc="Save a copy you can open offline" button="Download" />
          <ActionRow title="Sign out" desc="End your session on this device" button="Sign out" onClick={logout} />
          <ActionRow title="Delete account" desc="Remove your account and saved runs" button="Delete" danger />
        </div>
      </div>

      <ThingsToKnow result={result} studies={studies} />
    </div>
  );
}
