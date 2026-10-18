"use client";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { WaitlistInputSchema } from "@/contracts/platform";
import { postDashboard } from "@/integrations/dashboard-api/write";

export function WaitlistForm() {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    const parsed = WaitlistInputSchema.safeParse({
      requestId: requestId.current,
      company: form.get("company"),
      contactName: form.get("contactName"),
      role: form.get("role"),
      phone: form.get("phone"),
      fleetSize: form.get("fleetSize") ? Number(form.get("fleetSize")) : null,
      routes: String(form.get("routes") ?? "")
        .split(",")
        .map((route) => route.trim()),
      consent: form.get("consent") === "on",
    });
    if (!parsed.success) {
      setMessage("Revisa los datos y acepta el contacto.");
      return;
    }
    setState("saving");
    try {
      await postDashboard("/api/waitlist", parsed.data, z.object({ accepted: z.literal(true), requestId: z.uuid() }));
      setState("saved");
      setMessage("Registro recibido. Gracias por ayudarnos a validar PeruRoad.");
    } catch (error) {
      setState("idle");
      setMessage(error instanceof Error ? error.message : "No se pudo guardar. Intenta más tarde.");
    }
  }
  if (state === "saved") return <p role="status">{message}</p>;
  return (
    <form className="platform-form" onSubmit={(event) => void submit(event)}>
      <label>
        Empresa
        <input name="company" required minLength={2} maxLength={120} autoComplete="organization" />
      </label>
      <label>
        Nombre de contacto
        <input name="contactName" required minLength={2} maxLength={100} autoComplete="name" />
      </label>
      <label>
        Cargo
        <input name="role" required minLength={2} maxLength={80} />
      </label>
      <label>
        WhatsApp peruano
        <input name="phone" type="tel" required maxLength={30} autoComplete="tel" />
      </label>
      <label>
        Vehículos (opcional)
        <input name="fleetSize" type="number" min={0} max={100000} />
      </label>
      <label>
        Rutas de interés, separadas por coma
        <input name="routes" required maxLength={1200} placeholder="Lima – La Oroya" />
      </label>
      <label className="platform-consent">
        <input name="consent" type="checkbox" required />
        Autorizo que PeruRoad me contacte por WhatsApp sobre este proyecto. Mi teléfono se almacena cifrado.
      </label>
      <button className="pr-btn" disabled={state === "saving"}>
        {state === "saving" ? "Guardando…" : "Unirme a la lista"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
