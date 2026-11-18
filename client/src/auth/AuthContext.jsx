// client/src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../services/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Where the sign-in guard sends a visitor who just signed out (e.g. "/"),
  // instead of /login; cleared by the next sign-in.
  const [afterLogout, setAfterLogout] = useState(null);

  useEffect(() => {
    authApi
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await authApi.login(email, password);
    setAfterLogout(null);
    setUser(data);
  }

  async function register(payload) {
    const data = await authApi.register(payload);
    setAfterLogout(null);
    setUser(data);
  }

  async function setPrefs(prefs) {
    const r = await authApi.setPrefs(prefs);
    setUser((u) => (u ? { ...u, ...r } : u));
    return r;
  }

  // Signs out on this device at once (the guard then sends the visitor to `to`,
  // or /login), then ends the server session. Never throws: resolves false when
  // the server could not be reached, so callers need no catch.
  async function logout({ to = null } = {}) {
    setAfterLogout(to);
    setUser(null);
    try {
      await authApi.logout();
      return true;
    } catch (e) {
      console.warn(`Signed out on this device, but the server session could not be ended: ${e.message}`);
      return false;
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, afterLogout, login, register, logout, setPrefs }}>
      {children}
    </AuthCtx.Provider>
  );
}