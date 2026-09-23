import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8001';
const TOKEN_KEY = 'talentscout_access_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    axios.get(`${API_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setUser(response.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const authenticate = async (path, credentials) => {
    const response = await axios.post(`${API_URL}/api/v1/auth/${path}`, credentials);
    localStorage.setItem(TOKEN_KEY, response.data.access_token);
    setUser(response.data.user);
    return response.data;
  };

  const login = (credentials) => authenticate('login', credentials);
  const signup = (credentials) => authenticate('signup', credentials);
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export { API_URL, TOKEN_KEY };
