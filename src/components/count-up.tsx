"use client";

import { useEffect, useState } from "react";
import { animate } from "framer-motion";

export function CountUp({
  value,
  duration = 1.4,
  suffix = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {display.toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}
