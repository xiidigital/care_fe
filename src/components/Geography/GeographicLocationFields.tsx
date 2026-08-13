import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Autocomplete from "@/components/ui/autocomplete";
import { Label } from "@/components/ui/label";

import query from "@/Utils/request/query";
import geographyApi from "@/types/geography/geographyApi";

type LocationValue = {
  region_id?: number;
  subregion_id?: number;
  city_id?: number;
};

interface Props {
  countryId?: number | null;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  required?: boolean;
}

const optionsFor = (data?: { results: { id: number; name: string }[] }) =>
  data?.results.map((node) => ({ label: node.name, value: String(node.id) })) ??
  [];

export default function GeographicLocationFields({
  countryId,
  value,
  onChange,
  required = false,
}: Props) {
  const { t } = useTranslation();
  const { data: regions } = useQuery({
    queryKey: ["geography", "region", countryId],
    queryFn: query(geographyApi.list, {
      queryParams: {
        level: "region",
        parent: countryId ?? undefined,
        limit: 200,
      },
    }),
    enabled: !!countryId,
  });
  const { data: subregions } = useQuery({
    queryKey: ["geography", "subregion", value.region_id],
    queryFn: query(geographyApi.list, {
      queryParams: {
        level: "subregion",
        parent: value.region_id,
        limit: 200,
      },
    }),
    enabled: !!value.region_id,
  });
  const { data: cities } = useQuery({
    queryKey: ["geography", "city", value.subregion_id],
    queryFn: query(geographyApi.list, {
      queryParams: { level: "city", parent: value.subregion_id, limit: 200 },
    }),
    enabled: !!value.subregion_id,
  });

  if (!countryId) {
    return (
      <p className="text-sm text-red-600">
        Select a geographic governance organization linked to a country first.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <Label>{`Region${required ? " *" : ""}`}</Label>
        <Autocomplete
          value={value.region_id ? String(value.region_id) : ""}
          options={optionsFor(regions)}
          placeholder="Select region"
          onChange={(region) =>
            onChange({ region_id: region ? Number(region) : undefined })
          }
          noOptionsMessage={t("no_results_found")}
        />
      </div>
      <div className="space-y-2">
        <Label>{`Subregion${required ? " *" : ""}`}</Label>
        <Autocomplete
          value={value.subregion_id ? String(value.subregion_id) : ""}
          options={optionsFor(subregions)}
          placeholder="Select subregion"
          disabled={!value.region_id}
          onChange={(subregion) =>
            onChange({
              region_id: value.region_id,
              subregion_id: subregion ? Number(subregion) : undefined,
            })
          }
          noOptionsMessage={t("no_results_found")}
        />
      </div>
      <div className="space-y-2">
        <Label>City</Label>
        <Autocomplete
          value={value.city_id ? String(value.city_id) : ""}
          options={optionsFor(cities)}
          placeholder="Select city (optional)"
          disabled={!value.subregion_id}
          onChange={(city) =>
            onChange({
              region_id: value.region_id,
              subregion_id: value.subregion_id,
              city_id: city ? Number(city) : undefined,
            })
          }
          noOptionsMessage={t("no_results_found")}
        />
      </div>
    </div>
  );
}
