// "✓ Highest" / "✓ Lowest": the best value in its row or column. The icon and
// the word carry the meaning, never the colour alone.
import React from "react";

export default function BestChip({ higher = true, compact = false }) {
  const word = higher ? "Highest" : "Lowest";
  return (
    <span className={`ro-best-chip${compact ? " compact" : ""}`} title={`${word} value among the methods`}>
      <span aria-hidden="true">✓</span>{compact ? <span className="sr-only">{word}</span> : ` ${word}`}
    </span>
  );
}
