// client/src/services/api.js

/**
 * Helper to perform fetch requests with JSON parsing and standardized error handling.
 */
async function request(endpoint, options = {}) {
  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
    credentials: options.credentials || "include",
  };

  const response = await fetch(endpoint, config);

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Non-JSON error payload
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  // If response has no content (204 or empty), return empty object
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication API
// ─────────────────────────────────────────────────────────────────────────────
export const authApi = {
  async getMe() {
    return request("/api/auth/me");
  },

  async login(email, password) {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async register(payload) {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async logout() {
    return request("/api/auth/logout", {
      method: "POST",
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Instances API (OR-Library & Custom instances)
// ─────────────────────────────────────────────────────────────────────────────
export const instancesApi = {
  async getAll() {
    return request("/api/instances");
  },

  // Sampled wtpack instances with provenance (experiments/samples/sample30_seed42.json)
  async getWtpack() {
    return request("/api/instances?dataset=wtpack");
  },

  // numba warm-up state: { state: "cold"|"warming"|"warm"|"error", warm, seconds }
  async getReady() {
    return request("/api/ready");
  },

  async getDetails(instancePath) {
    if (!instancePath) {
      throw new Error("instancePath is required");
    }
    return request(`/api/instance-details?path=${encodeURIComponent(instancePath)}`);
  },

  async saveCustom({ container, items }) {
    return request("/api/instances/custom", {
      method: "POST",
      body: JSON.stringify({ container, items }),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Run History API
// ─────────────────────────────────────────────────────────────────────────────
export const runsApi = {
  async getHistory() {
    return request("/api/auth/runs");
  },

  async saveRun(runData) {
    return request("/api/auth/runs", {
      method: "POST",
      body: JSON.stringify(runData),
    });
  },

  /** Full row including result_json / convergence_json (the list omits them). */
  async getRun(id) {
    return request(`/api/auth/runs/${encodeURIComponent(id)}`);
  },

  async setLabel(id, label) {
    return request(`/api/auth/runs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    });
  },

  async deleteRun(id) {
    return request(`/api/auth/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Batch Runner API
// ─────────────────────────────────────────────────────────────────────────────
export const batchApi = {
  async runBatch(selectedSet) {
    return request("/api/run-batch", {
      method: "POST",
      body: JSON.stringify({ set: selectedSet }),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Studies API (SOP: four configurations x N seeds x instances, detached jobs)
// ─────────────────────────────────────────────────────────────────────────────
export const studiesApi = {
  async list() { return request("/api/studies"); },
  async sizes() { return request("/api/studies/sizes"); },
  async available() { return request("/api/studies/available"); },
  async importFile(file) {
    return request("/api/studies/import", { method: "POST", body: JSON.stringify({ file }) });
  },
  /** { size, seeds?, instanceId?, customLoad?, preset?, mode?, name? } */
  async create(payload) {
    return request("/api/studies", { method: "POST", body: JSON.stringify(payload) });
  },
  async get(id) { return request(`/api/studies/${encodeURIComponent(id)}`); },
  async progress(id) { return request(`/api/studies/${encodeURIComponent(id)}/progress`); },
  async runView(id, idx) { return request(`/api/studies/${encodeURIComponent(id)}/runs/${encodeURIComponent(idx)}/view`); },
  async remove(id) { return request(`/api/studies/${encodeURIComponent(id)}`, { method: "DELETE" }); },
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom loads (typed in / CSV) and ready-made OR-Library samples.
// The server's converter (preprocessing/custom_load.py) is authoritative.
// ─────────────────────────────────────────────────────────────────────────────
export const customLoadsApi = {
  /** -> { ok: true, id, summary } | { ok: false, errors: [{ row, column, message, line? }] } */
  async convert(payload) {
    const res = await fetch("/api/instances/custom-load", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    if (res.ok && body && body.id) return { ok: true, ...body };
    const errors = body && Array.isArray(body.errors) ? body.errors
      : [{ row: null, column: null, message: (body && body.error) || `Request failed with status ${res.status}` }];
    return { ok: false, errors };
  },
  async list() { return request("/api/instances/custom-loads"); },
  async get(id) { return request(`/api/instances/custom-load/${encodeURIComponent(id)}`); },
  async template(mode) { return request(`/api/instances/custom-load-template/${mode === "advanced" ? "advanced" : "simple"}`); },
  async samples() { return request("/api/instances/samples"); },
};

const api = {
  auth: authApi,
  studies: studiesApi,
  instances: instancesApi,
  runs: runsApi,
  batch: batchApi,
};

export default api;
