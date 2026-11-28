import React from "react";

// Home: clean, balanced start screen with hero CTA and three packing steps.

const STEPS = [
  {
    n: 1,
    title: "1. Add your boxes",
    desc: "Upload a CSV file, type in your box list, or pick a ready-made sample load.",
  },
  {
    n: 2,
    title: "2. Check the truck and safety settings",
    desc: "Confirm the container dimensions and the four loading and delivery-order rules.",
  },
  {
    n: 3,
    title: "3. Compare the packing results",
    desc: "Review packing performance, inspect the 3D container, and export the loading guide.",
  },
];

function Step({ n, title, desc, onClick }) {
  return (
    <button type="button" className="card step-card home-step-card" onClick={onClick}>
      <div className="home-step-top">
        <span className="home-step-num" aria-hidden="true">{n}</span>
        <span className="badge badge-primary">Step {n}</span>
      </div>
      <div className="card-title home-step-title">{title}</div>
      <div className="card-desc home-step-desc">{desc}</div>
    </button>
  );
}

export default function DashboardTab({ onStart }) {
  return (
    <div className="home-layout">
      <section className="card home-hero">
        <h1 className="font-display home-hero-title">Plan how your boxes go into one truck</h1>
        <p className="home-hero-sub">
          Arrange your load with STACKR, check every weight, fragility, support, and delivery-order rule, and compare packing methods in 3D.
        </p>
        <button type="button" className="btn btn-primary home-hero-cta" onClick={onStart}>
          Start analysis <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="home-steps-section" aria-label="How STACKR works">
        <div className="home-steps-heading">Three easy steps</div>
        <div className="grid grid-3 home-steps-grid">
          {STEPS.map((s) => (
            <Step key={s.n} n={s.n} title={s.title} desc={s.desc} onClick={onStart} />
          ))}
        </div>
      </section>
    </div>
  );
}
