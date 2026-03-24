const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const API_URL = rawApiUrl.replace(/\/$/, "");
export const API_BASE = `${API_URL}/api`;
