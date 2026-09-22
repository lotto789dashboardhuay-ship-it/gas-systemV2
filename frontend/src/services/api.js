import { API_BASE_URL } from "./config";

export const fetchAPI = async (endpoint, options = {}) => {
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`[API Error] ${endpoint}:`, error);
    return {
      success: false,
      message: error.message || "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
    };
  }
};