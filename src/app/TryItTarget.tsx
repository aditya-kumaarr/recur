"use client";

import { useEffect, useRef, useState } from "react";
import { TRY_IT_EVENT } from "./TryItLink";

export default function TryItTarget({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    function handle() {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulsing(true);
      window.setTimeout(() => setPulsing(false), 1500);
    }
    window.addEventListener(TRY_IT_EVENT, handle);
    return () => window.removeEventListener(TRY_IT_EVENT, handle);
  }, []);

  return (
    <div id="try-it" ref={ref} className={pulsing ? "recur-pulse" : ""}>
      {children}
    </div>
  );
}
