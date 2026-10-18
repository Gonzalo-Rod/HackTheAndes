import { loadResearchFiles } from "@/integrations/research-files/research-files_christian";

import { createResearchCatalogService } from "./research-catalog-service_christian";

export const researchCatalogService = createResearchCatalogService({ loadFiles: loadResearchFiles, now: Date.now });
