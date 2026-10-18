"use client";
import { Icon } from "@/components/icons";
import { whatsAppChatLink } from "@/domain/messaging/dashboard-links";
import { useWhatsAppContact } from "@/hooks/use-whatsapp-contact";

/**
 * Opens the bot with a prefilled command (the user still presses send). Renders nothing until the
 * server has a configured number, so an unconfigured deployment never shows a dead button.
 */
export function WhatsAppLink({
  command,
  label,
  title,
  className = "pr-btn",
}: {
  command: string;
  label: string;
  title?: string;
  className?: string;
}) {
  const contact = useWhatsAppContact();
  if (!contact) return null;
  return (
    <a
      className={className}
      href={whatsAppChatLink(contact.number, command)}
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? `Abre WhatsApp con «${command}»`}
    >
      <Icon name="external" size={14} />
      <span>{label}</span>
    </a>
  );
}
