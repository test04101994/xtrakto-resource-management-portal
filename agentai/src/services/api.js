const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

// Auth
export const authApi = {
  getRoles: () => request('/auth/roles'),
  login: (role, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, password }),
  }),
};

// Employees
export const employeesApi = {
  getAll: () => request('/employees'),
  create: (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
  bulkImport: (employees) => request('/employees/bulk', { method: 'POST', body: JSON.stringify({ employees }) }),
  bulkDelete: (ids) => request('/employees/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
};

// Cost Codes
export const costCodesApi = {
  getAll: () => request('/cost-codes'),
  create: (data) => request('/cost-codes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/cost-codes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/cost-codes/${id}`, { method: 'DELETE' }),
  bulkImport: (costCodes) => request('/cost-codes/bulk', { method: 'POST', body: JSON.stringify({ costCodes }) }),
  bulkDelete: (ids) => request('/cost-codes/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
};

// Lookups (dropdown master data)
export const lookupsApi = {
  getAll: () => request('/lookups'),
  get: (category) => request(`/lookups/${category}`),
  update: (category, values) => request(`/lookups/${category}`, { method: 'PUT', body: JSON.stringify({ values }) }),
  bulkImport: (lookups) => request('/lookups/bulk', { method: 'POST', body: JSON.stringify({ lookups }) }),
};

// Allocations
export const allocationsApi = {
  getAll: () => request('/allocations'),
  create: (data) => request('/allocations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/allocations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateType: (id, allocationType, lastModifiedBy) => request(`/allocations/${id}/type`, {
    method: 'PATCH',
    body: JSON.stringify({ allocationType, lastModifiedBy }),
  }),
  delete: (id) => request(`/allocations/${id}`, { method: 'DELETE' }),
  bulkImport: (allocations) => request('/allocations/bulk', { method: 'POST', body: JSON.stringify({ allocations }) }),
  bulkDelete: (ids) => request('/allocations/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
};

// Schemas (field configuration)
export const schemasApi = {
  getAll: () => request('/schemas'),
  get: (entityType) => request(`/schemas/${entityType}`),
  update: (entityType, fields) => request(`/schemas/${entityType}`, { method: 'PUT', body: JSON.stringify({ fields }) }),
};

// Submissions
export const submissionsApi = {
  getAll: () => request('/submissions'),
  getById: (id) => request(`/submissions/${id}`),
  create: (data) => request('/submissions', { method: 'POST', body: JSON.stringify(data) }),
};
