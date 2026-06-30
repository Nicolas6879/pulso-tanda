"use client";

import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID as string}
      config={{
        loginMethods: ["google", "email"],
        appearance: { theme: "light", accentColor: "#16a34a" },
        // Crea automáticamente un embedded wallet (incl. Stellar) al entrar.
        embeddedWallets: { createOnLogin: "all-users" },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
