// client/src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../services/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await authApi.login(email, password);
    setUser(data);
  }

  async function register(payload) {
    const data = await authApi.register(payload);
    setUser(data);
  }

  async function setPrefs(prefs) {
    const r = await authApi.setPrefs(prefs);
    setUser((u) => (u ? { ...u, ...r } : u));
    return r;
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, setPrefs }}>
      {children}
    </AuthCtx.Provider>
  );
}