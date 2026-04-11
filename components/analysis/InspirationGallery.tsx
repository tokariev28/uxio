"use client";

import { useRef, useEffect, useState, memo, RefObject } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  MotionValue,
} from "framer-motion";

/* ── Data ───────────────────────────────────────────────────────────────── */

const EXAMPLES = [
  { name: "Linear",      tagline: "The benchmark for UI clarity",         url: "https://linear.app",     image: "/examples/linear.png" },
  { name: "Vercel",      tagline: "Developer-first messaging",            url: "https://vercel.com",     image: "/examples/vercel.png" },
  { name: "Stripe",      tagline: "Trust signals that convert",           url: "https://stripe.com",     image: "/examples/stripe.png" },
  { name: "Notion",      tagline: "Positioning that shifted a market",    url: "https://notion.so",      image: "/examples/notion.png" },
  { name: "Figma",       tagline: "Show, don't tell — done perfectly",    url: "https://figma.com",      image: "/examples/figma.png" },
  { name: "Loom",        tagline: "Zero ambiguity in the hero",           url: "https://loom.com",       image: "/examples/loom.png" },
  { name: "Superhuman",  tagline: "Exclusivity as a conversion tool",     url: "https://superhuman.com", image: "/examples/superhuman.png" },
  { name: "Arc",         tagline: "Personality as differentiator",        url: "https://arc.net",        image: "/examples/arc.png" },
  { name: "Framer",      tagline: "Product demo in the hero itself",      url: "https://framer.com",     image: "/examples/framer.png" },
  { name: "Raycast",     tagline: "Community-driven viral growth",        url: "https://raycast.com",    image: "/examples/raycast.png" },
  { name: "Slack",       tagline: "Social proof at scale",                url: "https://slack.com",      image: "/examples/slack.png" },
  { name: "Intercom",    tagline: "Outcome-first value proposition",      url: "https://intercom.com",   image: "/examples/intercom.png" },
  { name: "Webflow",     tagline: "Visual proof in every scroll",         url: "https://webflow.com",    image: "/examples/webflow.png" },
  { name: "Calendly",    tagline: "Frictionless CTA hierarchy",           url: "https://calendly.com",   image: "/examples/calendly.png" },
  { name: "Ahrefs",      tagline: "Credibility through specificity",      url: "https://ahrefs.com",     image: "/examples/ahrefs.png" },
  { name: "Pitch",       tagline: "Brand confidence from pixel one",      url: "https://pitch.com",      image: "/examples/pitch.png" },
  { name: "Mercury",     tagline: "Trust in a regulated space",           url: "https://mercury.com",    image: "/examples/mercury.png" },
  { name: "Craft",       tagline: "Aesthetic as the product promise",     url: "https://craft.do",       image: "/examples/craft.png" },
  { name: "Resend",      tagline: "Developer experience as marketing",    url: "https://resend.com",     image: "/examples/resend.png" },
  { name: "Cron",        tagline: "Minimalism with maximum intent",       url: "https://cron.com",       image: "/examples/cron.png" },
] as const;

// Triple the list so the loop is seamless
const LOOPED_EXAMPLES = [...EXAMPLES, ...EXAMPLES, ...EXAMPLES];

type Example = (typeof EXAMPLES)[number];

const SCROLL_SPEED = 0.6; // px per frame (~36px/s at 60fps)

/* ── Local hooks ────────────────────────────────────────────────────────── */

function useIsTouchDevice(): boolean {
  const [touch] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(hover: none)").matches
      : false
  );
  return touch;
}

/* ── GalleryCard ────────────────────────────────────────────────────────── */

interface GalleryCardProps {
  item: Example;
  instanceKey: string;
  scrollXMV: MotionValue<number>;
  containerRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  isTouch: boolean;
  onCardMouseEnter: () => void;
  onCardMouseLeave: () => void;
}

const GalleryCard = memo(function GalleryCard({
  item,
  instanceKey,
  scrollXMV,
  containerRef,
  reducedMotion,
  isTouch,
  onCardMouseEnter,
  onCardMouseLeave,
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
    onCardMouseEnter();
  };

  const handleMouseLeave = () => {
    mouseXRaw.set(0);
    mouseYRaw.set(0);
    translateYRaw.set(0);
    onCardMouseLeave();
  };

  return (
    <motion.div
      ref={cardRef}
      key={instanceKey}
      className="relative shrink-0 cursor-pointer overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-shadow"
      style={{
        height: "240px",
        aspectRatio: "16/10",
        rotateY: reducedMotion ? 0 : rotateY,
        rotateX: reducedMotion ? 0 : mouseRotateX,
        translateY,
        transformPerspective: 1400,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => window.open(item.url, "_blank", "noopener")}
    >
      {/* Screenshot / placeholder */}
      <Image
        src={item.image}
        alt={item.name}
        fill
        className="object-cover object-top"
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
});

/* ── InspirationGallery ─────────────────────────────────────────────────── */

export function InspirationGallery() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollXMV = useMotionValue(0);
  const reducedMotion = useReducedMotion() ?? false;
  const isTouch = useIsTouchDevice();
  const isHovered = useRef(false);

  /* Sync scrollLeft → scrollXMV (drives per-card tilt) */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => scrollXMV.set(el.scrollLeft);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollXMV]);

  /* Auto-scroll RAF loop — pauses when tab is hidden */
  useEffect(() => {
    if (reducedMotion || isTouch) return;
    const el = containerRef.current;
    if (!el) return;

    let rafId: number;
    let paused = false;

    function onVisibility() {
      paused = document.hidden;
      if (!paused) rafId = requestAnimationFrame(tick);
    }

    function tick() {
      if (paused) return;
      if (!isHovered.current && el) {
        el.scrollLeft += SCROLL_SPEED;
        // When we've scrolled past the first copy, jump back seamlessly
        const oneThird = el.scrollWidth / 3;
        if (el.scrollLeft >= oneThird) {
          el.scrollLeft -= oneThird;
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    document.addEventListener("visibilitychange", onVisibility);
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion, isTouch]);

  return (
    <div className="w-full">
      <p className="text-2xl font-bold text-foreground mb-5 px-8">
        Websites we love
      </p>
      <div
        ref={containerRef}
        className="flex gap-5 overflow-x-auto px-8 py-4 pb-8 gallery-scroll"
        style={{ scrollPaddingLeft: "2rem" }}
        onMouseEnter={() => { isHovered.current = true; }}
        onMouseLeave={() => { isHovered.current = false; }}
      >
        {LOOPED_EXAMPLES.map((item, i) => (
          <GalleryCard
            key={`${item.name}-${i}`}
            instanceKey={`${item.name}-${i}`}
            item={item}
            scrollXMV={scrollXMV}
            containerRef={containerRef}
            reducedMotion={reducedMotion}
            isTouch={isTouch}
            onCardMouseEnter={() => { isHovered.current = true; }}
            onCardMouseLeave={() => { isHovered.current = false; }}
          />
        ))}
      </div>
    </div>
  );
}
