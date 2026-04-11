"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#080c18",
          color: "#ffffff",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, letterSpacing: "-0.02em" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 24 }}>
            A critical error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              border: "none",
              background: "#ffffff",
              color: "#080c18",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
