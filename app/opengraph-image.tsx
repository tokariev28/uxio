import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Uxio — See your landing page through your competitor's eyes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts CSS endpoint — fetched with an old UA so Google returns TTF.
// Satori (next/og) only supports OTF/TTF; woff2 throws "Unsupported OpenType signature".
const INSTRUMENT_SERIF_CSS =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1";

const SCORES = [
  { label: "Communication", value: 94 },
  { label: "Conversion", value: 88 },
  { label: "Visual", value: 91 },
];

export default async function OGImage() {
  const css = await fetch(INSTRUMENT_SERIF_CSS, {
    headers: {
      // Old UA → Google returns TTF instead of woff2.
      "User-Agent": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)",
    },
  }).then((r) => r.text());

  const ttfUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!ttfUrl) throw new Error("Could not parse Instrument Serif TTF URL");

  const fontData = await fetch(ttfUrl).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 72px",
          background: "#09090b",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow — top-left indigo */}
        <div
          style={{
            position: "absolute",
            top: -160,
            left: -160,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 65%)",
            display: "flex",
          }}
        />
        {/* Background glow — bottom-right subtle */}
        <div
          style={{
            position: "absolute",
            bottom: -200,
            right: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Top wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            style={{
              color: "#fafafa",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Uxio
          </span>
          <span style={{ color: "#3f3f46", fontSize: 16, fontFamily: "system-ui" }}>
            /
          </span>
          <span
            style={{
              color: "#52525b",
              fontSize: 13,
              letterSpacing: "0.08em",
              fontFamily: "system-ui, sans-serif",
              textTransform: "uppercase",
            }}
          >
            AI Landing Page Analyzer
          </span>
        </div>

        {/* Headline block */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontFamily: '"InstrumentSerif", Georgia, serif',
              fontSize: 66,
              fontStyle: "italic",
              fontWeight: 400,
              color: "#fafafa",
              lineHeight: 1.08,
              letterSpacing: "-0.025em",
              maxWidth: 860,
            }}
          >
            See your landing page through your competitor&#x2019;s eyes.
          </div>
          <div
            style={{
              color: "#71717a",
              fontSize: 22,
              fontFamily: "system-ui, sans-serif",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            AI competitive analysis for SaaS teams
          </div>
        </div>

        {/* Score pills */}
        <div style={{ display: "flex", gap: 10 }}>
          {SCORES.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 18px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <span
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  fontFamily: "system-ui, sans-serif",
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  color: "#e4e4e7",
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "InstrumentSerif",
          data: fontData,
          style: "italic",
          weight: 400,
        },
      ],
    }
  );
}
