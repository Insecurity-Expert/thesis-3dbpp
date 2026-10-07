// Rank circle: rank 1 is filled green, the others grey. No rank -> nothing.
import React from "react";

export default function RankBadge({ rank }) {
  if (rank == null) return <span className="ro-rank empty" aria-hidden="true" />;
  return <span className={`ro-rank${rank === 1 ? " top" : ""}`} aria-label={`Rank ${rank}`}>{rank}</span>;
}
