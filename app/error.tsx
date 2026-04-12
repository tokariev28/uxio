"use client";

import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay },
  };
}

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="hero-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        className="hero-content"
        style={{
          justifyContent: "center",
          minHeight: "unset",
          paddingTop: "0",
          paddingBottom: "0",
          gap: "1.25rem",
        }}
      >
        <motion.p
          {...fadeUp(0)}
          style={{
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.4)",
            margin: 0,
          }}
        >
          Something went wrong
        </motion.p>

        <motion.h1 className="hero-heading" {...fadeUp(0.08)}>
          An unexpected <em>error</em> occurred
        </motion.h1>

        <motion.p className="hero-subtitle" {...fadeUp(0.16)}>
          The analysis encountered a problem. You can try again — if it
          persists, the issue is on our end.
        </motion.p>

        <motion.div {...fadeUp(0.24)} style={{ marginTop: "0.5rem" }}>
          <button
            onClick={reset}
            className="hero-submit"
            style={{ display: "inline-block", cursor: "pointer" }}
          >
            Try again
          </button>
        </motion.div>
      </div>
    </div>
  );
}
