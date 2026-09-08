import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { useOidcRedirect } from "@/components/Auth/external/useOidcRedirect";

import { providersFor } from "@/Utils/auth/oidcProviders";
import { useOidcProviders } from "@/Utils/auth/useOidcProviders";
import mutate from "@/Utils/request/mutate";
import query from "@/Utils/request/query";
import externalAuthApi from "@/types/auth/externalAuthApi";

/**
 * The account's own external sign-in providers (ADR-0011 §5.2b, §5.6).
 *
 * Linking here is self-service and workforce-only: the principal proves it
 * holds the external identity by completing a full round trip, and CARE binds
 * that subject to whoever is already authenticated. There is no field for
 * naming someone else, because a link endpoint that accepted a target would be
 * an account-takeover endpoint with extra steps.
 *
 * Unlinking is always available and never destructive. Removing the last
 * provider leaves the account and its other sign-in methods exactly as they
 * were.
 */
export const LinkedIdentities = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { providers } = useOidcProviders();
  const { redirect, redirectingTo } = useOidcRedirect();

  const { data: identities } = useQuery({
    queryKey: ["oidc-linked-identities"],
    queryFn: query(externalAuthApi.oidcLinkedIdentities),
  });

  const { mutateAsync: unlink } = useMutation({
    mutationFn: (id: string) =>
      mutate(externalAuthApi.oidcUnlink, { pathParams: { id } })(
        {} as Record<string, never>,
      ),
    onSuccess: () => {
      toast.success(t("provider_unlinked"));
      void queryClient.invalidateQueries({
        queryKey: ["oidc-linked-identities"],
      });
    },
  });

  const workforceProviders = providersFor(providers, "workforce");
  if (!workforceProviders.length && !identities?.length) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {identities?.length ? (
          <ul className="divide-y divide-gray-100">
            {identities.map((identity) => (
              <li
                key={identity.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  {/* Operator-supplied text, rendered as text. */}
                  <p className="truncate text-sm font-medium">
                    {identity.display_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {identity.last_login_at
                      ? new Date(identity.last_login_at).toLocaleString()
                      : t("never")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void unlink(identity.id)}
                >
                  {t("unlink_provider")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">{t("no_linked_providers")}</p>
        )}

        {workforceProviders.length > 0 && (
          <div className="space-y-2">
            {workforceProviders.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="w-full"
                disabled={redirectingTo !== null}
                onClick={() => {
                  void redirect(provider, window.location.pathname).catch(() =>
                    toast.error(t("external_login_failed")),
                  );
                }}
              >
                {redirectingTo === provider.id
                  ? t("redirecting")
                  : t("continue_with_provider", {
                      provider: provider.display_name,
                    })}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
