import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Only the three museum image hosts (plus GitHub avatars) may serve images.
const imageHosts = [
  "https://www.artic.edu",
  "https://images.metmuseum.org",
  "https://openaccess-cdn.clevelandart.org",
  "https://avatars.githubusercontent.com",
];

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${imageHosts.join(" ")}`,
  "font-src 'self' data:",
  // OpenSeadragon fetches IIIF info.json + tiles directly from AIC.
  `connect-src 'self' https://www.artic.edu${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://github.com",
  "object-src 'none'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.artic.edu", pathname: "/iiif/**" },
      { protocol: "https", hostname: "images.metmuseum.org", pathname: "/CRDImages/**" },
      { protocol: "https", hostname: "openaccess-cdn.clevelandart.org" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 828, 1080, 1440, 1920, 2560],
    // Every `quality` prop used in src must be listed here (Next 15.5+ warns otherwise).
    qualities: [72, 75, 85],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Browsers must use HTTPS for this site for 2 years (ignored on plain-http localhost).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default config;
