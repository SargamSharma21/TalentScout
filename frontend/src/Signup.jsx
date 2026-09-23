import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', company_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await signup(form);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to create the account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel signup-panel">
        <div className="auth-brand"><span className="brand-mark">TS</span><span>TalentScout</span></div>
        <div className="auth-heading"><p className="eyebrow">02 / New workspace</p><h1>Start with signal.</h1><p>Create a private screening workspace for your team.</p></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>Full name<input name="full_name" value={form.full_name} onChange={updateField} autoComplete="name" required /></label>
          <label>Company name<input name="company_name" value={form.company_name} onChange={updateField} autoComplete="organization" required /></label>
          <label>Email address<input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" value={form.password} onChange={updateField} minLength="8" autoComplete="new-password" required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create account'} <span>-&gt;</span></button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
