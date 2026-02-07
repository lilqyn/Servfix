const GUEST_ID_KEY = "servfix-guest-id";

const generateGuestId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const getGuestId = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(GUEST_ID_KEY);
};

export const ensureGuestId = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const existing = window.localStorage.getItem(GUEST_ID_KEY);
  if (existing) {
    return existing;
  }
  const created = generateGuestId();
  window.localStorage.setItem(GUEST_ID_KEY, created);
  return created;
};

export const clearGuestId = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(GUEST_ID_KEY);
};
