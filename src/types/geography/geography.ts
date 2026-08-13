export type GeographicLevel = "country" | "region" | "subregion" | "city";

export interface GeographicCatalogNode {
  id: number;
  name: string;
  display_name: string;
  level: GeographicLevel;
  country_code: string | null;
}

export interface GeographyContext {
  direct: GeographicCatalogNode | null;
  country: GeographicCatalogNode | null;
}

export interface GeographicLocation {
  region: GeographicCatalogNode | null;
  subregion: GeographicCatalogNode | null;
  city: GeographicCatalogNode | null;
}
