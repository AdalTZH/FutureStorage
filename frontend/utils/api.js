const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': 'demo_user',
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  chat:    (message, history = []) => apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ message, history }) }),
  stt:     (blob) => fetch(`${API_URL}/api/stt`, { method: 'POST', body: blob, headers: { 'x-user-id': 'demo_user' } }).then(r => r.json()),
  tts:     async (text) => {
    const res = await fetch(`${API_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'demo_user' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('TTS failed');
    return res.blob();
  },
  hosts:   ()                => apiFetch('/api/hosts'),
  host:    (id)              => apiFetch(`/api/hosts/${id}`),
  bookings: ()               => apiFetch('/api/bookings'),
  createBooking: (data)      => apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) }),
  createIntent:  (data)      => apiFetch('/api/payments/create-intent', { method: 'POST', body: JSON.stringify(data) }),
  capturePayment: (id)       => apiFetch('/api/payments/capture', { method: 'POST', body: JSON.stringify({ payment_intent_id: id }) }),
  climate:  (district)       => apiFetch(`/api/climate/${district}`),
  inventory: ()              => apiFetch('/api/inventory'),
  accuracy: ()               => apiFetch('/api/accuracy'),
  submitFeedback: (data)     => apiFetch('/api/accuracy/feedback', { method: 'POST', body: JSON.stringify(data) }),
  proactiveTrigger: (data)   => apiFetch('/api/proactive/trigger', { method: 'POST', body: JSON.stringify(data) }),
};

export const wsUrl = process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    : 'ws://localhost:8000');
