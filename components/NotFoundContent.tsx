"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE, delay },
  };
}

export function NotFoundContent() {
  return (
    <div className="hero-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Ghost numerals */}
      <motion.p
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.04 }}
        transition={{ duration: 0.8, ease: EASE }}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "clamp(10rem, 32vw, 28rem)",
          fontWeight: 900,
          color: "#ffffff",
          letterSpacing: "-0.06em",
          lineHeight: 1,
          pointerEvents: "none",
          userSelect: "none",
          margin: 0,
          zIndex: 0,
        }}
      >
        404
      </motion.p>

      {/* Content */}
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
          Error 404
        </motion.p>

        <motion.h1 className="hero-heading" {...fadeUp(0.08)}>
          Something went <em>missing</em>
        </motion.h1>

        <motion.p className="hero-subtitle" {...fadeUp(0.16)}>
          This page doesn&apos;t exist. If you were in the middle of an
          analysis, head back and try again.
        </motion.p>

        <motion.div {...fadeUp(0.24)} style={{ marginTop: "0.5rem" }}>
          <Link href="/" className="hero-submit" style={{ display: "inline-block", textDecoration: "none" }}>
            Back to Uxio
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
