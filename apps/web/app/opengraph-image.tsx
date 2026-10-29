import { ImageResponse } from "next/og";

export const alt = "Averion — ask your documents, with the cited passage beside the answer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F8F8F7",
          color: "#0F0F0E",
          padding: "72px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#4F46E5",
              color: "#F8F8F7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 600
            }}
          >
            A
          </div>
          <div style={{ fontSize: 22, letterSpacing: 0.4 }}>Averion</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.05,
              letterSpacing: -1.4,
              maxWidth: 860,
              fontWeight: 520
            }}
          >
            Answers that stay attached to the page.
          </div>
          <div style={{ fontSize: 28, color: "#75736E", maxWidth: 760 }}>
            Ask across the documents your workspace has indexed, then read the
            passage the answer came from.
          </div>
        </div>
      </div>
    ),
    size
  );
}
