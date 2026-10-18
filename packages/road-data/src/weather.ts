export { createPrecipitationProvider } from "./integrations/open-meteo/precipitation.ts";
export {
  readWeatherFile,
  writeWeatherFile,
  readBundledWeather,
} from "./integrations/open-meteo/weather-files.ts";
export { prepareCatchmentWeather } from "./services/prepare-catchment-weather.ts";
export { aggregateRain, summarizeOperationalWeather } from "./domain/weather/aggregate.ts";
export { createDataSnapshotRepository } from "./db/data-snapshots.ts";
export { weatherCaptureSchema } from "./contracts/catchment-weather.ts";
