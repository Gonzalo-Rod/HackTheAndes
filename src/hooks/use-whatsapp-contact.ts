"use client";
import { useEffect, useState } from "react";
import type { WhatsAppContact } from "@/contracts/platform";
import { fetchWhatsAppContact } from "@/integrations/dashboard-api/client";

/** One request per page load, shared by every WhatsApp button. */
let pending: Promise<WhatsAppContact | null> | null = null;

/** The bot's number, or null while loading, when not configured, or when the lookup failed. */
export function useWhatsAppContact(): WhatsAppContact | null {
  const [contact, setContact] = useState<WhatsAppContact | null>(null);
  useEffect(() => {
    let cancelled = false;
    pending ??= fetchWhatsAppContact().catch(() => {
      // A failed lookup only hides the optional buttons; the next page load tries again.
      pending = null;
      return null;
    });
    void pending.then((value) => {
      if (!cancelled) setContact(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return contact;
}
