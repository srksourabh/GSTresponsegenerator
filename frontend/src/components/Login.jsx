import { useState } from 'react';
import { api, setAuthToken } from '../api';

export default function Login({ onSuccess, theme, onToggleTheme }) {
  const [mode, setMode] = useState('credentials');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const session = await api.login(email.trim(), password);
      setAuthToken(session.token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const session = await api.register(name.trim(), email.trim(), password);
      setAuthToken(session.token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Could not create account');
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = async () => {
    setError('');
    setBusy(true);
    try {
      const session = await api.guestLogin();
      setAuthToken(session.token);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Could not start guest session');
    } finally {
      setBusy(false);
    }
  };

  const submitToken = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    setAuthToken(token.trim());
    try {
      await api.checkAuth();
      onSuccess();
    } catch {
      setAuthToken('');
      setError('That access token was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <button className="login-theme" onClick={onToggleTheme}>
        {theme === 'dark' ? '☀ Light' : '☾ Dark'}
      </button>

      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">CP</div>
          <div>
            <div className="login-title">Compliance Panel</div>
            <div className="login-sub">GST Advisory</div>
          </div>
        </div>

        <p
          className="muted"
          style={{
            fontSize: '0.85rem',
            lineHeight: 1.5,
            marginTop: -4,
            marginBottom: 16,
            paddingBottom: 14,
            borderBottom: '1px solid var(--border)',
          }}
        >
          Indian GST notice scrutiny &amp; statutory reply workbench, prepared in
          consultation with{' '}
          <a
            href="https://www.linkedin.com/in/caloganathan/"
            target="_blank"
            rel="noreferrer"
          >
            CA Loganathan Anandan
          </a>{' '}
          (FCA, CISA, CDPSE, CFE, FIPA), Founder of Straits Partners and President
          Director of PT JCSS Management Consulting, specialising in cross-border
          advisory, compliance, and risk strategy.
        </p>

        {mode === 'register' ? (
          <form onSubmit={submitRegister}>
            <div className="field">
              <label htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="CA / Practitioner Name"
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="reg-password">Password (min 8 characters)</label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={busy || !name.trim() || !email.trim() || password.length < 8}
            >
              {busy ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        ) : mode === 'credentials' ? (
          <form onSubmit={submitCredentials}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={busy || !email.trim() || !password}
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitToken}>
            <div className="field">
              <label htmlFor="token">Access token</label>
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
                required
              />
              <div className="field-help">
                The shared secret configured as APP_ACCESS_TOKEN.
              </div>
            </div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={busy || !token.trim()}
            >
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%' }}
            disabled={busy}
            onClick={continueAsGuest}
          >
            Continue as Guest (No data saved)
          </button>
          <div className="field-help" style={{ marginTop: 6, textAlign: 'center' }}>
            Scan your notice, generate the reply, and download the Word report—nothing is saved on the server.
          </div>
        </div>

        <div className="login-note">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 0 }}
              onClick={() => {
                setMode(mode === 'register' ? 'credentials' : 'register');
                setError('');
              }}
            >
              {mode === 'register'
                ? 'Already have an account? Sign in'
                : 'New here? Create an account'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 0 }}
              onClick={() => {
                setMode(mode === 'token' ? 'credentials' : 'token');
                setError('');
              }}
            >
              {mode === 'token'
                ? 'Sign in with email and password'
                : 'Use a shared access token instead'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
