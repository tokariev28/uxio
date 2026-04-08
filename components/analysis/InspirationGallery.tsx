"use client";

import { useRef, useEffect, useState, RefObject } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from "framer-motion";

/* ── Data ───────────────────────────────────────────────────────────────── */

const EXAMPLES = [
  { name: "Linear",      tagline: "The benchmark for UI clarity",         url: "https://linear.app",     image: "/examples/linear.svg" },
  { name: "Vercel",      tagline: "Developer-first messaging",            url: "https://vercel.com",     image: "/examples/vercel.svg" },
  { name: "Stripe",      tagline: "Trust signals that convert",           url: "https://stripe.com",     image: "/examples/stripe.svg" },
  { name: "Notion",      tagline: "Positioning that shifted a market",    url: "https://notion.so",      image: "/examples/notion.svg" },
  { name: "Figma",       tagline: "Show, don't tell — done perfectly",    url: "https://figma.com",      image: "/examples/figma.svg" },
  { name: "Loom",        tagline: "Zero ambiguity in the hero",           url: "https://loom.com",       image: "/examples/loom.svg" },
  { name: "Superhuman",  tagline: "Exclusivity as a conversion tool",     url: "https://superhuman.com", image: "/examples/superhuman.svg" },
  { name: "Arc",         tagline: "Personality as differentiator",        url: "https://arc.net",        image: "/examples/arc.svg" },
  { name: "Framer",      tagline: "Product demo in the hero itself",      url: "https://framer.com",     image: "/examples/framer.svg" },
  { name: "Raycast",     tagline: "Community-driven viral growth",        url: "https://raycast.com",    image: "/examples/raycast.svg" },
  { name: "Slack",       tagline: "Social proof at scale",                url: "https://slack.com",      image: "/examples/slack.svg" },
  { name: "Intercom",    tagline: "Outcome-first value proposition",      url: "https://intercom.com",   image: "/examples/intercom.svg" },
  { name: "Webflow",     tagline: "Visual proof in every scroll",         url: "https://webflow.com",    image: "/examples/webflow.svg" },
  { name: "Mixpanel",    tagline: "Data storytelling as positioning",     url: "https://mixpanel.com",   image: "/examples/mixpanel.svg" },
  { name: "Calendly",    tagline: "Frictionless CTA hierarchy",           url: "https://calendly.com",   image: "/examples/calendly.svg" },
  { name: "Ahrefs",      tagline: "Credibility through specificity",      url: "https://ahrefs.com",     image: "/examples/ahrefs.svg" },
  { name: "Pitch",       tagline: "Brand confidence from pixel one",      url: "https://pitch.com",      image: "/examples/pitch.svg" },
  { name: "Mercury",     tagline: "Trust in a regulated space",           url: "https://mercury.com",    image: "/examples/mercury.svg" },
  { name: "Craft",       tagline: "Aesthetic as the product promise",     url: "https://craft.do",       image: "/examples/craft.svg" },
  { name: "Perplexity",  tagline: "Clarity over complexity",              url: "https://perplexity.ai",  image: "/examples/perplexity.svg" },
  { name: "Resend",      tagline: "Developer experience as marketing",    url: "https://resend.com",     image: "/examples/resend.svg" },
  { name: "Cron",        tagline: "Minimalism with maximum intent",       url: "https://cron.com",       image: "/examples/cron.svg" },
] as const;

type Example = (typeof EXAMPLES)[number];

/* ── Local hooks ────────────────────────────────────────────────────────── */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(hover: none)").matches);
  }, []);
  return touch;
}

/* ── GalleryCard ────────────────────────────────────────────────────────── */

interface GalleryCardProps {
  item: Example;
  scrollXMV: MotionValue<number>;
  containerRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  isTouch: boolean;
}

function GalleryCard({
  item,
  scrollXMV,
  containerRef,
  reducedMotion,
  isTouch,
}: GalleryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  /* Scroll-based rotateY */
  const scrollRotateYRaw = useMotionValue(0);
  const scrollRotateY = useSpring(scrollRotateYRaw, {
    stiffness: 120,
    damping: 20,
  });

  /* Mouse tilt (normalized -0.5 … 0.5) */
  const mouseXRaw = useMotionValue(0);
  const mouseYRaw = useMotionValue(0);
  const mouseXSpring = useSpring(mouseXRaw, { stiffness: 300, damping: 25 });
  const mouseYSpring = useSpring(mouseYRaw, { stiffness: 300, damping: 25 });
  const mouseRotateX = useTransform(mouseYSpring, [-0.5, 0.5], [5, -5]);
  const mouseRotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-5, 5]);

  /* Combined rotateY = scroll component + mouse component */
  const rotateY = useTransform(
    [scrollRotateY, mouseRotateY] as MotionValue<number>[],
    ([s, m]: number[]) => s + m,
  );

  /* Hover lift */
  const translateYRaw = useMotionValue(0);
  const translateY = useSpring(translateYRaw, { stiffness: 300, damping: 25 });

  /* Subscribe to scroll to update per-card rotation */
  useEffect(() => {
    if (reducedMotion) return;
    return scrollXMV.on("change", (scrollLeft) => {
      const container = containerRef.current;
      const card = cardRef.current;
      if (!container || !card) return;
      const containerCenter = scrollLeft + container.offsetWidth / 2;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const relativePos = cardCenter - containerCenter;
      const maxOffset = container.offsetWidth * 0.8;
      const rotation = Math.min(8, Math.max(-8, (relativePos / maxOffset) * 8));
      scrollRotateYRaw.set(rotation);
    });
  }, [scrollXMV, containerRef, scrollRotateYRaw, reducedMotion]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouch || reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseXRaw.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseYRaw.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseEnter = () => {
    if (!isTouch) translateYRaw.set(-8);
  };

  const handleMouseLeave = () => {
    mouseXRaw.set(0);
    mouseYRaw.set(0);
    translateYRaw.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      className="relative shrink-0 cursor-pointer overflow-hidden rounded-xl w-[220px] sm:w-[260px] shadow-md hover:shadow-xl transition-shadow"
      style={{
        aspectRatio: "16/10",
        rotateY: reducedMotion ? 0 : rotateY,
        rotateX: reducedMotion ? 0 : mouseRotateX,
        translateY,
        transformPerspective: 1400,
        scrollSnapAlign: "start",
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => window.open(item.url, "_blank", "noopener")}
    >
      {/* Screenshot / placeholder */}
      <img
        src={item.image}
        alt={item.name}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.75))",
        }}
      />

      {/* Text */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col gap-0.5">
        <span className="text-white font-semibold text-sm leading-tight">
          {item.name}
        </span>
        <span className="text-white/70 text-xs leading-tight">
          {item.tagline}
        </span>
      </div>
    </motion.div>
  );
}

/* ── InspirationGallery ─────────────────────────────────────────────────── */

export function InspirationGallery() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollXMV = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const isTouch = useIsTouchDevice();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => scrollXMV.set(el.scrollLeft);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollXMV]);

  return (
    <div className="w-full">
      <p className="text-xs text-muted-foreground/50 mb-3 px-6">
        The bar you&apos;re being measured against
      </p>
      <div
        ref={containerRef}
        className="flex gap-3 overflow-x-auto px-6 pb-4 gallery-scroll"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {EXAMPLES.map((item) => (
          <GalleryCard
            key={item.name}
            item={item}
            scrollXMV={scrollXMV}
            containerRef={containerRef}
            reducedMotion={reducedMotion}
            isTouch={isTouch}
          />
        ))}
      </div>
    </div>
  );
}
