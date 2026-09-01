import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RaktSetu — follow your blood donation's journey";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          background: "linear-gradient(135deg, #faf8f6 0%, #f0fdfa 100%)",
          padding: "80px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -160,
            width: 440,
            height: 440,
            borderRadius: "50%",
            background: "#ccfbf1",
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            left: -120,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "#fecdd3",
            opacity: 0.35,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 40 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#0d9488",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              color: "#fff",
            }}
          >
            ◆
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#1c1917", display: "flex" }}>
            RaktSetu
          </div>
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, color: "#1c1917", display: "flex", lineHeight: 1.15 }}>
          Follow your blood
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, color: "#0f766e", display: "flex", lineHeight: 1.15 }}>
          donation&apos;s journey.
        </div>
        <div style={{ fontSize: 28, color: "#57534e", display: "flex", marginTop: 32 }}>
          Open-source. Privacy-preserving. Donor-first.
        </div>
      </div>
    ),
    size
  );
}
