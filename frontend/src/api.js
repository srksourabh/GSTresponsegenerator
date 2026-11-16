/**
 * API client.
 *
 * By default the API is same-origin: Vite proxies /api to :8001 in
 * development, and in a single-service deployment the backend serves this
 * bundle itself.
 *
 * Set VITE_API_BASE_URL at build time to point the frontend at a backend on a
 * different host — the split deployment where the UI is served from a static
 * host and the API runs elsewhere. Include the scheme and no trailing slash,
 * e.g. https://llm-council.onrender.com
 */

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');

/** Resolve an API path against the configured base. */
export function apiUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

const TOKEN_KEY = 'llm_council_token';
const OPENROUTER_KEY_STORAGE = 'openrouter_api_key';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getOpenRouterKey() {
  return localStorage.getItem(OPENROUTER_KEY_STORAGE) || '';
}

export function setOpenRouterKey(key) {
  const cleaned = (key || '').trim();
  if (cleaned) localStorage.setItem(OPENROUTER_KEY_STORAGE, cleaned);
  else localStorage.removeItem(OPENROUTER_KEY_STORAGE);
}

function authHeaders() {
  const headers = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orKey = getOpenRouterKey();
  if (orKey) headers['X-OpenRouter-Key'] = orKey;
  return headers;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * The server's error `detail`, or a status-only fallback.
 *
 * Shared so the streaming calls report what the API actually said. They built
 * their own "(403)" message and threw the body away, which hid the one line
 * that explains the failure — the tier that was rejected, the permission that
 * was missing, the model ID that was stale.
 */
async function errorDetail(response, fallbackLabel) {
  try {
    const body = await response.json();
    if (body?.detail) return body.detail;
  } catch {
    /* non-JSON error body */
  }
  return `${fallbackLabel} (${response.status})`;
}

/** The filename the server asked for, from Content-Disposition. */
function filenameFromDisposition(response) {
  const header = response.headers?.get?.('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1].trim()) : '';
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, response.status);
  }
  return response;
}

async function json(path, options) {
  return (await request(path, options)).json();
}

export const api = {
  // ---- auth ----
  checkAuth: () => json('/api/auth/check'),

  async login(email, password) {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      let detail = 'Invalid email or password';
      try {
        const body = await response.json();
        if (body.detail) detail = body.detail;
      } catch { /* ignore */ }
      throw new ApiError(detail, response.status);
    }
    return response.json();
  },

  async register(name, email, password) {
    const response = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) {
      let detail = 'Could not create account';
      try {
        const body = await response.json();
        if (body.detail) detail = body.detail;
      } catch { /* ignore */ }
      throw new ApiError(detail, response.status);
    }
    return response.json();
  },

  async guestLogin() {
    const response = await fetch(apiUrl('/api/auth/guest'), {
      method: 'POST',
    });
    if (!response.ok) {
      throw new ApiError('Could not start guest session', response.status);
    }
    return response.json();
  },

  logout: () => json('/api/auth/logout', { method: 'POST' }),

  changePassword: (current_password, new_password) =>
    json('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  // ---- panel ----
  panelConfig: () => json('/api/panel/config'),

  /**
   * Upload one or more notice documents and get a proposed matter back.
   *
   * A scrutiny notice arrives as at least two files — the one-page portal form
   * carrying the reference and the reply date, and the attachment carrying the
   * defects. Both go up in one request.
   */
  async extractNotice(files, { domain = 'gst', tier } = {}) {
    const body = new FormData();
    for (const file of [].concat(files)) body.append('files', file);
    const params = new URLSearchParams({ domain, ...(tier ? { tier } : {}) });
    const response = await fetch(apiUrl(`/api/panel/extract?${params}`), {
      method: 'POST',
      headers: authHeaders(),   // no Content-Type: the browser sets the boundary
      body,
    });
    if (!response.ok) {
      let detail = `Could not read the notice (${response.status})`;
      try {
        const payload = await response.json();
        if (payload.detail) detail = payload.detail;
      } catch { /* non-JSON error body */ }
      throw new ApiError(detail, response.status);
    }
    return response.json();
  },
  /** Upload a 2A/3B reconciliation; returns the bucketed summary. */
  async uploadReconciliation(file, { domain = 'gst', tier } = {}) {
    const body = new FormData();
    body.append('file', file);
    const params = new URLSearchParams({ domain, ...(tier ? { tier } : {}) });
    const response = await fetch(apiUrl(`/api/panel/reconciliation?${params}`), {
      method: 'POST',
      headers: authHeaders(),
      body,
    });
    if (!response.ok) {
      let detail = `Could not read the reconciliation (${response.status})`;
      try {
        const payload = await response.json();
        if (payload.detail) detail = payload.detail;
      } catch { /* non-JSON error body */ }
      throw new ApiError(detail, response.status);
    }
    return response.json();
  },

  dashboard: () => json('/api/dashboard'),
  listMatters: () => json('/api/matters'),
  getMatter: (id) => json(`/api/matters/${id}`),
  deleteMatter: (id) => json(`/api/matters/${id}`, { method: 'DELETE' }),

  exportUrl: (id, document = 'reply') =>
    apiUrl(`/api/matters/${id}/export?document=${document}`),

  /**
   * Download one of the two documents a matter produces.
   *
   * `reply` is filed with the department. `file_note` is the internal working
   * paper and must never be. They are separate downloads because they are
   * separate documents with separate audiences.
   */
  async downloadMatter(id, filename, document = 'reply') {
    const response = await request(`/api/matters/${id}/export?document=${document}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename || filenameFromDisposition(response) ||
      (document === 'file_note' ? 'File_Note_INTERNAL.docx' : 'Reply.docx');
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  /** Download a Word (.docx) report directly from memory (used in Guest mode). */
  async downloadInlineReport(payload) {
    const response = await request('/api/panel/export-inline', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filenameFromDisposition(response) || 'GST_Notice_Reply.docx';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * Every reply deadline on file, as a calendar file.
   *
   * A download rather than a subscribable feed: a live feed URL has to carry
   * its own credential, and minting a long-lived token that exposes the
   * client list is not a trade worth making for a self-hosted deployment.
   */
  async downloadCalendar() {
    const response = await request('/api/matters/calendar.ics');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'compliance-panel-deadlines.ics';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  /** Interest, penalty stages, pre-deposit and amnesty position. */
  matterComputations: (id) => json(`/api/matters/${id}/computations`),

  /** What a run will cost, in rupees, before it is run. */
  estimatePanel: (payload) =>
    json('/api/panel/estimate', { method: 'POST', body: JSON.stringify(payload) }),

  /** Run the panel, streaming stage events. */
  async runPanel(payload, onEvent) {
    const response = await fetch(apiUrl('/api/panel/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new ApiError(await errorDetail(response, 'Panel run failed'),
                         response.status);
    }
    await consumeSSE(response, onEvent);
  },

  // ---- admin ----
  adminUsers: () => json('/api/admin/users'),
  createUser: (payload) =>
    json('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) =>
    json(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteUser: (id) => json(`/api/admin/users/${id}`, { method: 'DELETE' }),
  adminSettings: () => json('/api/admin/settings'),
  health: () => json('/api/health'),

  // ---- generic council (retained) ----
  listConversations: () => json('/api/conversations'),
  createConversation: () =>
    json('/api/conversations', { method: 'POST', body: JSON.stringify({}) }),
  getConversation: (id) => json(`/api/conversations/${id}`),
  deleteConversation: (id) => json(`/api/conversations/${id}`, { method: 'DELETE' }),

  async sendMessageStream(conversationId, content, options, onEvent) {
    const response = await fetch(
      apiUrl(`/api/conversations/${conversationId}/message/stream`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          content,
          mode: options?.mode || 'full',
          web_search: Boolean(options?.webSearch),
        }),
      }
    );
    if (!response.ok) {
      throw new ApiError(await errorDetail(response, 'Failed to send message'),
                         response.status);
    }
    await consumeSSE(response, onEvent);
  },
};

/** Read an SSE stream, buffering across chunk boundaries. */
async function consumeSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawTerminal = false;

  const dispatchChunk = (raw) => {
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'complete' || event.type === 'error') {
          sawTerminal = true;
        }
        onEvent(event.type, event);
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) dispatchChunk(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatchChunk(raw);
    }
  }

  if (!sawTerminal) {
    throw new Error('The response stream ended unexpectedly before finishing. Please try again.');
  }
}
