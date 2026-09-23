import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to sign in with those credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand"><span className="brand-mark">TS</span><span>TalentScout</span></div>
        <div className="auth-heading"><p className="eyebrow">01 / Secure workspace</p><h1>Welcome back.</h1><p>Sign in to continue screening with evidence.</p></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Email address<input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" value={form.password} onChange={updateField} autoComplete="current-password" required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'} <span>-&gt;</span></button>
        </form>
        <p className="auth-switch">New to TalentScout? <Link to="/signup">Create an account</Link></p>
      </section>
    </main>
  );
}
