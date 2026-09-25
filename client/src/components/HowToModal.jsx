// "How to use STACKR" — the prototype's six-step pop-up, rewritten for the
// guided flow. Opens by itself only on a new account's first login (unless
// "Don't show this again" is ticked); otherwise from the top-bar help button
// and the Home banner. Both flags are stored on the account.
import React, { useEffect, useState } from "react";
import { Modal } from "./ui";
import { METHODS } from "../methods";

const nick = (c) => `${METHODS[c].name} (${METHODS[c].nick})`;

export default function HowToModal({ open, onClose, hidden, onSetHidden }) {
  // Shown ticked at once; put back if the account could not be updated.
  const [checked, setChecked] = useState(!!hidden);
  useEffect(() => { setChecked(!!hidden); }, [hidden]);
  const toggle = async (e) => {
    const v = e.target.checked;
    setChecked(v);
    try { await onSetHidden(v); } catch { setChecked(!v); }
  };
  return (
    <Modal open={open} onClose={onClose} title="How to use STACKR" desc="Six simple steps. You don't need any training to get started." maxWidth={640} labelledBy="howto-title"
      footer={<>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-muted)", marginRight: "auto" }}>
          <input type="checkbox" checked={checked} onChange={toggle} /> Don't show this again
        </label>
        <button type="button" className="btn btn-primary" onClick={onClose}>Got it — let's start</button>
      </>}>
      <div className="guide-step-list">
        {[
          [<b>Add your boxes.</b>, <> Go to "Start analysis". Upload a CSV file, type your boxes in, or try a sample from the OR-Library benchmark. The upload screen explains the columns and has a template.</>],
          [<b>Check the settings.</b>, <> For your own boxes, enter the container size (length from the door to the cab × width × height, in cm) and, if you like, a truck weight limit. Samples use their own container.</>],
          [<b>Meet the four methods.</b>, <> {nick("DGWO")}, {nick("MOGWO")}, {nick("SEQ")} and {nick("REP")}. You don't have to pick one.</>],
          [<b>Run STACKR.</b>, <> Run STACKR runs all four methods on your load, several times each, and shows its progress while it works.</>],
          [<b>Look at the results.</b>, <> "Results" shows the four solutions side by side and which one is recommended for this load, with a short reason. Sometimes two methods do about equally well, and it says so.</>],
          [<b>Print your loading plan.</b>, <> Loading Guide gives you a plan you can print: the loading order, the unloading order, and a picture of where every box goes.</>],
        ].map(([head, body], i) => (
          <div className="guide-step" key={i}>
            <div className="guide-step-num">{i + 1}</div>
            <div className="guide-step-body">{head}{body}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
