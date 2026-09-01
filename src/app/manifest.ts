import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RaktSetu — follow your blood donation's journey",
    short_name: "RaktSetu",
    description:
      "Open-source, privacy-preserving transparency layer between blood banks, hospitals and blood donors.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f6",
    theme_color: "#0d9488",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
