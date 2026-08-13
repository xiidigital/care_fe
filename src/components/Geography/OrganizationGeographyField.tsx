import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import Autocomplete from "@/components/ui/autocomplete";
import { Label } from "@/components/ui/label";

import query from "@/Utils/request/query";
import { GeographicLevel } from "@/types/geography/geography";
import geographyApi from "@/types/geography/geographyApi";
import { Organization } from "@/types/organization/organization";

type GeographyValue = {
  country_id?: number;
  region_id?: number;
  subregion_id?: number;
  city_id?: number;
};

interface Props {
  parent?: Organization;
  value: GeographyValue;
  onChange: (value: GeographyValue) => void;
}

const nextLevel: Record<GeographicLevel, GeographicLevel | null> = {
  country: "region",
  region: "subregion",
  subregion: "city",
  city: null,
};

const labelFor: Record<GeographicLevel, string> = {
  country: "Country",
  region: "Region",
  subregion: "Subregion",
  city: "City",
};

export default function OrganizationGeographyField({
  parent,
  value,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const parentNode = parent?.geography?.direct;
  const level = parentNode ? nextLevel[parentNode.level] : "country";
  const parentId = parentNode?.id;
  const selectedValue = level
    ? value[`${level}_id` as keyof GeographyValue]
    : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["organization-geography", level, parentId],
    queryFn: query(geographyApi.list, {
      queryParams: {
        level: level ?? "country",
        parent: parentId,
        limit: 200,
      },
    }),
    enabled: !!level && (!parentNode || !!parentId),
  });

  if (!level) {
    return (
      <p className="text-sm text-muted-foreground">
        A city organization cannot have a geographic child.
      </p>
    );
  }

  if (parent && !parentNode) {
    return (
      <p className="text-sm text-red-600">
        The parent organization needs a direct geographic node before a child
        can be created.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label aria-required>{labelFor[level]}</Label>
      <Autocomplete
        value={selectedValue ? String(selectedValue) : ""}
        options={
          data?.results.map((node) => ({
            label: node.display_name || node.name,
            value: String(node.id),
          })) ?? []
        }
        isLoading={isLoading}
        placeholder={`Select ${labelFor[level].toLowerCase()}`}
        onChange={(nodeId) => onChange({ [`${level}_id`]: Number(nodeId) })}
        noOptionsMessage={t("no_results_found")}
      />
    </div>
  );
}
