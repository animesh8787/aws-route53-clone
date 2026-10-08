/** Compact "aws" wordmark with the orange smile, as data URIs (no binary asset to ship). */
function logo(textColor: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 38" height="30" width="50">` +
    `<text x="1" y="22" fill="${textColor}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="25" letter-spacing="-1">aws</text>` +
    `<path d="M5 28c14 7 33 7 47 0" fill="none" stroke="#ff9900" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M46 24l8 3.4-6.4 5.4" fill="none" stroke="#ff9900" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const AWS_LOGO_WHITE = logo("#ffffff");
export const AWS_LOGO_DARK = logo("#232f3e");
