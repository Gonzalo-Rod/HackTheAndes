"use client";
import { useEffect, useState } from "react";
import type { HazardLayer, CatchmentWeatherLayer } from "@/contracts/model-inputs";
import { fetchHazardLayer, fetchCatchmentWeather } from "@/integrations/dashboard-api/client";
type SourceState<T> = { data: T | null; error: string | null };
export function useModelInputs() {
  const [hazards, setHazards] = useState<SourceState<HazardLayer>>({ data: null, error: null });
  const [weather, setWeather] = useState<SourceState<CatchmentWeatherLayer>>({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [hazardResult, weatherResult] = await Promise.allSettled([fetchHazardLayer(), fetchCatchmentWeather()]);
      if (cancelled) return;
      setHazards((previous) =>
        hazardResult.status === "fulfilled"
          ? { data: hazardResult.value, error: null }
          : { ...previous, error: "Capas oficiales no disponibles; no implica ausencia de peligro." },
      );
      setWeather((previous) =>
        weatherResult.status === "fulfilled"
          ? { data: weatherResult.value, error: null }
          : { ...previous, error: "Lluvia por cuenca no disponible; no se interpreta como cero." },
      );
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return { hazards, weather };
}
