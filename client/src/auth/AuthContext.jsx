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

  // Ends the server session, then signs out here (the guard sends the visitor to
  // `to`, or /login). If the server does not confirm, the user stays signed in
  // (a reload would otherwise sign them straight back in). Never throws:
  // resolves true when signed out, false otherwise, so callers need no catch.
  async function logout({ to = null } = {}) {
    try {
      await authApi.logout();
    } catch (e) {
      console.warn(`Sign-out failed, still signed in: ${e.message}`);
      return false;
    }
    setAfterLogout(to);
    setUser(null);
    return true;
  }

  async function deleteAccount(password) {
    await authApi.deleteAccount(password);
    setAfterLogout("/");
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, afterLogout, login, register, logout, setPrefs, deleteAccount }}>
      {children}
    </AuthCtx.Provider>
  );
}