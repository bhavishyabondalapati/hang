"use client";

import { MotionConfig } from "framer-motion";

/** Every Framer Motion animation respects the user's reduced-motion setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
