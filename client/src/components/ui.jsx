// client/src/components/ui.jsx — the prototype's pop-up (modal) and toast,
// as React components. A pop-up closes with its buttons, Esc, or a click
// outside the box. A toast is only ever raised by the caller AFTER the action
// it reports has succeeded.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export function Modal({ open, onClose, title, desc, children, footer, maxWidth = 620, labelledBy }) {
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useEffect(() => { if (open && boxRef.current) boxRef.current.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth }} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} ref={boxRef}>
        <div className="modal-head">
          <div>
            <div className="card-title" id={labelledBy}>{title}</div>
            {desc && <div className="card-desc">{desc}</div>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 24, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const show = useCallback((msg, type) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-host no-print" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast${t.type ? ` toast-${t.type}` : ""}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
