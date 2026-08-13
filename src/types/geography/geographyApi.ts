import { HttpMethod, PaginatedResponse, Type } from "@/Utils/request/types";

import { GeographicCatalogNode, GeographicLevel } from "./geography";

export default {
  list: {
    path: "/api/v1/geography/",
    method: HttpMethod.GET,
    TRes: Type<PaginatedResponse<GeographicCatalogNode>>(),
    TQuery: Type<{
      level: GeographicLevel;
      parent?: number;
      search?: string;
      limit?: number;
    }>(),
  },
} as const;
