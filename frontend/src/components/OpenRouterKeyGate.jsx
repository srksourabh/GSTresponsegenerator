import { useState } from 'react';
import { getOpenRouterKey, setOpenRouterKey } from '../api';

/**
 * Prompts a logged-in user for their OpenRouter API key (BYOK) when the
 * server has no shared key configured, or when the user chooses to update it.
 */
export default function OpenRouterKeyGate({
  hasServerKey = false,
  isGuest = false,
  onSave,
  onCancel,
  onLogout,
}) {
  const [key, setKey] = useState(() => getOpenRouterKey());
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = key.trim();
    if (!cleaned) {
      setError('Please enter your OpenRouter API key to continue.');
      return;
    }
    if (!cleaned.startsWith('sk-or-')) {
      setError('OpenRouter API keys normally start with "sk-or-". Please check your key.');
      return;
    }
    setOpenRouterKey(cleaned);
    onSave(cleaned);
  };

  return (
    <div className="login">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-brand">
          <div className="brand-mark">CP</div>
          <div>
            <div className="login-title">Connect OpenRouter API Key</div>
            <div className="login-sub">Required to draft GST notice replies</div>
          </div>
        </div>

        <p className="muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>
          Enter your personal OpenRouter API key. Your key is stored only in your
          browser and sent securely per request—it is never saved to the server.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="openrouter-key">OpenRouter API Key</label>
            <input
              id="openrouter-key"
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError('');
              }}
              placeholder="sk-or-v1-..."
              autoFocus
              required
            />
            <div className="field-help">
              Get a key at{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
              >
                openrouter.ai/keys
              </a>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!key.trim()}
            >
              Save Key &amp; Open App →
            </button>
            {onCancel && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="login-note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {hasServerKey && getOpenRouterKey() && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 0 }}
              onClick={() => {
                setOpenRouterKey('');
                onSave('');
              }}
            >
              Use server default key
            </button>
          )}
          {!isGuest && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 0, marginLeft: 'auto' }}
              onClick={onLogout}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
