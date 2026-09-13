// Public presentation identity. Repository, app IDs, and existing local clip storage stay stable.
export const BRAND_NAME = 'Hopmodo';
export const SITE_URL = import.meta.env?.VITE_SITE_URL || 'https://fitness-pair-playground.rajatsg18.chatgpt.site';
export const SITE_HOST = new URL(SITE_URL).host;
export const LOGO_URL = '/assets/hopmodo-mark.svg';
export const brandLink = () => `<img src="${LOGO_URL}" width="36" height="36" alt=""><span>hopmodo</span>`;
