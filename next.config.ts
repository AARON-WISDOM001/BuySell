import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/a/**",
      },
    ],
  },
  // This project sits inside a directory that has its own package-lock.json.
  // Without pinning the root, Turbopack walks up, adopts that lockfile as the
  // workspace, and warns on every build.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
