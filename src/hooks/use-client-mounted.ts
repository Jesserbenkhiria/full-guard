"use client";

import { useEffect, useState } from "react";

/** True only after the client has mounted — avoids SSR/client mismatches from browser-only APIs. */
export function useClientMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
