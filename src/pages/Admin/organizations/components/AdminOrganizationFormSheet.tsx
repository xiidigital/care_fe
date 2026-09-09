import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as z from "zod";

import CareIcon from "@/CAREUI/icons/CareIcon";

import OrganizationGeographyField from "@/components/Geography/OrganizationGeographyField";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import mutate from "@/Utils/request/mutate";
import query from "@/Utils/request/query";
import {
  OrgType,
  Organization,
  OrganizationCreate,
  OrganizationUpdate,
} from "@/types/organization/organization";
import organizationApi from "@/types/organization/organizationApi";

interface Props {
  organizationType: string;
  parentId?: string;
  org?: Organization;
}

export default function AdminOrganizationFormSheet({
  organizationType,
  parentId,
  org,
}: Props) {
  const { t } = useTranslation();

  const isEditMode = !!org;
  const isRoleOrganizationPage = organizationType === OrgType.ROLE;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: parentOrganization } = useQuery({
    queryKey: ["organization", parentId],
    queryFn: query(organizationApi.get, { pathParams: { id: parentId || "" } }),
    enabled: !!parentId && organizationType === OrgType.GOVT,
  });

  const formSchema = z.object({
    name: z
      .string()
      .trim()
      .min(1, { message: t("field_required") }),
    description: z.string().optional(),
    org_type: z.enum(OrgType),
    country_id: z.number().int().optional(),
    region_id: z.number().int().optional(),
    subregion_id: z.number().int().optional(),
    city_id: z.number().int().optional(),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      org_type: organizationType as OrgType,
    },
  });

  useEffect(() => {
    if (isEditMode && org) {
      form.reset({
        name: org.name || "",
        description: org.description || "",
        org_type: org.org_type as OrgType,
        // The API returns null for an unset level; the form field is optional.
        country_id: org.country_id ?? undefined,
        region_id: org.region_id ?? undefined,
        subregion_id: org.subregion_id ?? undefined,
        city_id: org.city_id ?? undefined,
      });
    } else if (!isEditMode && open) {
      form.reset({
        name: "",
        description: "",
        org_type: organizationType as OrgType,
        country_id: undefined,
        region_id: undefined,
        subregion_id: undefined,
        city_id: undefined,
      });
    }
  }, [form, isEditMode, org, open, organizationType]);

  const { mutate: createOrganization, isPending: isCreating } = useMutation({
    mutationFn: (body: OrganizationCreate) =>
      mutate(organizationApi.create, {
        body,
      })(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organization"],
      });
      toast.success(t("organization_created_successfully"));
      setOpen(false);
      form.reset();
    },
  });

  const { mutate: updateOrganization, isPending: isUpdating } = useMutation({
    mutationFn: (body: OrganizationUpdate) =>
      mutate(organizationApi.update, {
        pathParams: { id: org?.id },
        body,
      })(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organization"],
      });
      toast.success(t("organizations_updated_successfully"));
      setOpen(false);
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const parentOrgId = isRoleOrganizationPage ? undefined : parentId;
    const organizationData = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      org_type: values.org_type,
      country_id: values.country_id,
      region_id: values.region_id,
      subregion_id: values.subregion_id,
      city_id: values.city_id,
    };

    if (isEditMode) {
      updateOrganization(organizationData);
    } else {
      createOrganization({ ...organizationData, parent: parentOrgId });
    }
  };

  const isPending = isCreating || isUpdating;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {isEditMode ? (
          <Button variant="white" size="sm" className="font-semibold">
            {isRoleOrganizationPage ? t("edit_role_organization") : t("edit")}
          </Button>
        ) : (
          <Button className="w-full md:w-auto">
            <CareIcon icon="l-plus" className="mr-2 size-4" />
            {isRoleOrganizationPage
              ? t("create_role_organization")
              : t("add_organization")}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {isRoleOrganizationPage
              ? isEditMode
                ? t("edit_role_organization")
                : t("create_role_organization")
              : isEditMode
                ? t("edit_department_team")
                : t("create_department_team")}
          </SheetTitle>
          <SheetDescription>
            {isRoleOrganizationPage
              ? isEditMode
                ? t("edit_role_organization_description")
                : t("create_role_organization_description")
              : isEditMode
                ? t("edit_department_team_description")
                : t("create_department_team_description")}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 py-4"
          >
            {isRoleOrganizationPage && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <ShieldCheck className="size-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {t("role_organization_record")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {t("role_organization_record_description")}
                </p>
              </div>
            )}

            {organizationType === OrgType.GOVT && (
              <OrganizationGeographyField
                parent={parentOrganization}
                value={{
                  country_id: form.watch("country_id"),
                  region_id: form.watch("region_id"),
                  subregion_id: form.watch("subregion_id"),
                  city_id: form.watch("city_id"),
                }}
                onChange={(geography) => {
                  form.setValue("country_id", geography.country_id, {
                    shouldDirty: true,
                  });
                  form.setValue("region_id", geography.region_id, {
                    shouldDirty: true,
                  });
                  form.setValue("subregion_id", geography.subregion_id, {
                    shouldDirty: true,
                  });
                  form.setValue("city_id", geography.city_id, {
                    shouldDirty: true,
                  });
                }}
              />
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel aria-required>{t("name")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={
                        isRoleOrganizationPage
                          ? t("enter_role_organization_name")
                          : t("enter_department_team_name")
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>{t("description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={
                        isRoleOrganizationPage
                          ? t("enter_role_organization_description")
                          : t("enter_department_team_description")
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || !form.formState.isDirty}
            >
              {isPending
                ? isEditMode
                  ? t("updating")
                  : t("creating")
                : isRoleOrganizationPage
                  ? isEditMode
                    ? t("update_role_organization")
                    : t("create_role_organization")
                  : isEditMode
                    ? t("update_organization")
                    : t("create_organization")}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
