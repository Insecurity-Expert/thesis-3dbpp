// client/src/LandingPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';

const FEATURES = [
  {
    title: '3D Bin Packing Solver',
    body: 'Give it a set of items with dimensions and a container, and it searches for an arrangement that fits them. It decides position and orientation for every box, not just whether they fit.',
  },
  {
    title: 'Interactive 3D Visualization',
    body: 'Rotate, zoom, and inspect the packed result in the browser. Packing is genuinely hard to reason about from a table of coordinates — seeing it is the fastest way to spot wasted space or an awkward layout.',
  },
  {
    title: 'Printable Loading Guide',
    body: 'Turn an arrangement into a plan a worker can follow: the loading order, the unloading order for each delivery stop, and a picture of where every box goes.',
  },
  {
    title: 'Strategy Comparison',
    body: 'Run different packing strategies against the same input and compare the outcomes side by side, so you can pick the approach that suits your load rather than guessing.',
  },
];

const REASONS = [
  {
    heading: 'Packing is where the money leaks',
    body: 'Container, pallet, and truck space is billed by capacity, not by how much of it you actually used. A layout that leaves a third of a container empty still costs the same as a full one. Small gains in volume utilization translate directly into fewer shipments.',
  },
  {
    heading: 'It is an NP-hard problem',
    body: 'There is no fast algorithm that guarantees the optimal arrangement for arbitrary inputs. In practice you use heuristics and search, which means the quality of your result depends on the approach and the time you give it. That makes it worth being able to see and compare what you are getting.',
  },
  {
    heading: '3D layouts are unintuitive',
    body: 'Humans are bad at mentally rotating and nesting irregular sets of boxes. A solver that only prints coordinates is hard to trust, because you cannot tell whether a poor result came from the input or the algorithm. Visual feedback closes that gap.',
  },
  {
    heading: 'Good for learning, not just shipping',
    body: 'Because the solver and the visualization sit together, it doubles as a way to build intuition: try a method, see where it wastes space, and compare it with the others. That is hard to get from a black-box optimizer alone.',
  },
];

const BTN = {
  padding: '15px 40px',
  borderRadius: 'var(--radius)',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const PRIMARY_BTN = { ...BTN, background: 'var(--primary)', color: 'var(--on-primary)', border: 'none', boxShadow: 'var(--shadow-md)' };
const SECONDARY_BTN = { ...BTN, background: 'var(--bg-card)', color: 'var(--primary)', border: '1.5px solid var(--primary)' };

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-app)',
      color: 'var(--text-main)',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* ---- Hero ---- */}
      <section style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '96px 24px 64px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(36px, 6vw, 56px)',
          fontWeight: 700,
          letterSpacing: '0',
          color: 'var(--primary)',
          margin: '0 0 20px',
        }}>
          STACKR
        </h1>
        <p style={{
          fontSize: 'clamp(17px, 2.2vw, 21px)',
          lineHeight: 1.6,
          color: 'var(--text-muted)',
          maxWidth: 620,
          margin: '0 auto 36px',
        }}>
          A 3D bin packing optimizer with a live view of what it is doing.
          Define your items and container, let the solver search for a
          layout, and watch the result take shape in 3D.
        </p>
        {/* Signed in: straight to the app. Otherwise: Log in or Register. */}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <button type="button" onClick={() => navigate('/app')} style={PRIMARY_BTN}>Open STACKR</button>
          ) : (
            <>
              <button type="button" onClick={() => navigate('/login')} style={PRIMARY_BTN}>Log in</button>
              <button type="button" onClick={() => navigate('/register')} style={SECONDARY_BTN}>Register</button>
            </>
          )}
        </div>
      </section>

      {/* ---- What it does ---- */}
      <section style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '48px 24px',
      }}>
        <h2 style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          textAlign: 'center',
          margin: '0 0 40px',
        }}>
          What it does
        </h2>
        <div className="landing-2col">
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '24px 22px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-main)',
                margin: '0 0 10px',
              }}>
                {f.title}
              </h3>
              <p style={{
                fontSize: 14.5,
                lineHeight: 1.65,
                color: 'var(--text-muted)',
                margin: 0,
              }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Why it matters ---- */}
      <section style={{
        background: 'var(--primary-light)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: '64px 24px',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            textAlign: 'center',
            margin: '0 0 44px',
          }}>
            Why it matters
          </h2>
          <div className="landing-2col landing-2col-wide">
          {REASONS.map((r) => (
            <div key={r.heading}>
              <h3 style={{
                fontSize: 19,
                fontWeight: 700,
                color: 'var(--text-main)',
                margin: '0 0 8px',
              }}>
                {r.heading}
              </h3>
              <p style={{
                fontSize: 15.5,
                lineHeight: 1.7,
                color: 'var(--text-muted)',
                margin: 0,
              }}>
                {r.body}
              </p>
            </div>
          ))}
          </div>
        </div>
      </section>
    </div>
  );
}