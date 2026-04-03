"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push("/");
  }, [session, router]);

  if (status === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#18181b" }}>
        <div style={{ color: "#71717a", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#18181b", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background: "#27272a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "40px 48px", textAlign: "center", maxWidth: 380, width: "90%" }}>

        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="#18181b" />
              <rect x="9" y="1" width="6" height="6" rx="1" fill="#18181b" opacity="0.4" />
              <rect x="1" y="9" width="6" height="6" rx="1" fill="#18181b" opacity="0.4" />
              <rect x="9" y="9" width="6" height="6" rx="1" fill="#18181b" />
            </svg>
          </div>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: "#fafafa", marginBottom: 6, letterSpacing: "-0.4px" }}>
          Workflow Generator
        </div>
        <div style={{ fontSize: 13, color: "#71717a", marginBottom: 32 }}>
          Sign in with your company account
        </div>

        <button
          onClick={() => signIn("keycloak", { callbackUrl: "/" })}
          style={{ width: "100%", padding: "12px 20px", borderRadius: 10, border: "none", background: "#fff", color: "#18181b", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.15s" }}
          onMouseOver={e => (e.currentTarget.style.opacity = "0.9")}
          onMouseOut={e => (e.currentTarget.style.opacity = "1")}
        >
          Sign in with SSO
        </button>

        <div style={{ marginTop: 20, fontSize: 11, color: "#52525b" }}>
          Internal tool · access restricted to company network
        </div>
      </div>
    </div>
  );
}
