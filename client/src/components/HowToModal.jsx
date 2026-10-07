// "How to use STACKR" — the prototype's six-step pop-up, rewritten for the
// guided flow. Opens by itself only on a new account's first login (stored on
// the account); otherwise from the top-bar help button and the Home banner.
import React from "react";
import { Modal } from "./ui";
import { METHODS } from "../methods";

const nick = (c) => `${METHODS[c].name} (${METHODS[c].nick})`;

export default function HowToModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="How to use STACKR" desc="Six simple steps. You don't need any training to get started." maxWidth={640} labelledBy="howto-title"
      footer={<>
        <button type="button" className="btn btn-primary" onClick={onClose}>Got it — let's start</button>
      </>}>
      <div className="guide-step-list">
        {[
          [<b>Add your boxes.</b>, <> Go to "Start analysis". Upload a CSV file, type your boxes in, or try a sample from the OR-Library benchmark. The upload screen explains the columns and has a template.</>],
          [<b>Check the settings.</b>, <> For your own boxes, enter the container size (length from the door to the cab × width × height, in cm) and, if you like, a truck weight limit. Samples use their own container.</>],
          [<b>Meet the four methods.</b>, <> {nick("DGWO")}, {nick("MOGWO")}, {nick("SEQ")} and {nick("REP")}. You don't have to pick one.</>],
          [<b>Run STACKR.</b>, <> Run STACKR runs all four methods on your load, several times each, and shows its progress while it works.</>],
          [<b>Look at the results.</b>, <> "Results" compares the two hybrid configurations, Sequential and Repair-Based, measure by measure; "View full comparison" adds DGWO and MOGWO. Gaps under 2 percentage points (or 2 boxes) are shown as level. Your saved runs and comparisons stay in Run History, under its Runs and Studies tabs.</>],
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
