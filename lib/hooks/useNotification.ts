"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const SESSION_KEY = "uxio:notif-banner-dismissed";
const isSupported =
  typeof window !== "undefined" && "Notification" in window;

export function useNotification({
  isRunning,
  isComplete,
}: {
  isRunning: boolean;
  isComplete: boolean;
}) {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    () => (isSupported ? Notification.permission : null)
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    // Reading from sessionStorage (external system) is a legitimate use of setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isSupported) setBannerDismissed(sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const isTabVisible = useRef(true);
  const originalTitle = useRef("");
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise DOM refs and attach visibility listener on mount
  useEffect(() => {
    if (!isSupported) return;
    originalTitle.current = document.title;
    isTabVisible.current = !document.hidden;

    const handleVisibility = () => {
      isTabVisible.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Tab title management
  useEffect(() => {
    if (isRunning) {
      document.title = "Analyzing\u2026 \u2022 Uxio";
      return;
    }

    if (isComplete) {
      document.title = "\u2713 Analysis ready \u2022 Uxio";

      // Restore title once the user looks at the tab
      let restoreTimer: ReturnType<typeof setTimeout> | null = null;

      const scheduleRestore = () => {
        restoreTimer = setTimeout(() => {
          document.title = originalTitle.current || "Uxio";
        }, 3000);
      };

      if (!document.hidden) {
        scheduleRestore();
      } else {
        const onFocus = () => {
          if (!document.hidden) {
            scheduleRestore();
            document.removeEventListener("visibilitychange", onFocus);
          }
        };
        document.addEventListener("visibilitychange", onFocus);
        return () => {
          document.removeEventListener("visibilitychange", onFocus);
          if (restoreTimer) clearTimeout(restoreTimer);
        };
      }

      return () => {
        if (restoreTimer) clearTimeout(restoreTimer);
      };
    }
  }, [isRunning, isComplete]);

  // Fire notification when analysis completes while tab is hidden
  useEffect(() => {
    if (!isComplete || !isSupported || permission !== "granted") return;
    if (isTabVisible.current) return;

    const n = new Notification("Analysis complete", {
      body: "Your competitor analysis is ready to view.",
      icon: "/favicon.svg",
      tag: "analysis-complete",
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, [isComplete, permission]);

  const showBanner =
    isSupported &&
    isRunning &&
    permission === "default" &&
    !bannerDismissed;

  const requestPermission = useCallback(async () => {
    if (!isSupported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    setShowConfirmation(true);
    confirmationTimer.current = setTimeout(() => {
      setShowConfirmation(false);
    }, 4000);
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    sessionStorage.setItem(SESSION_KEY, "1");
  }, []);

  // Cleanup confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  const isGranted = permission === "granted";
  const isDenied = permission === "denied";

  return { isGranted, isDenied, showBanner, showConfirmation, requestPermission, dismissBanner };
}
