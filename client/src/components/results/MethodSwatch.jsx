// The method's colour square; the same colours identify methods everywhere
// (tokens --method-seq / -rep / -dgwo / -mogwo in index.css).
import React from "react";
import { METHOD_INFO } from "../../viewer/resultsMetrics";

export default function MethodSwatch({ code }) {
  const info = METHOD_INFO[code];
  return <span className="ro-swatch" style={{ background: info ? info.swatch : "var(--border-strong)" }} aria-hidden="true" />;
}
