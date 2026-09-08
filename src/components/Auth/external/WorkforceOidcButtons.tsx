import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { useOidcRedirect } from "@/components/Auth/external/useOidcRedirect";

import { providersFor } from "@/Utils/auth/oidcProviders";
import { useOidcProviders } from "@/Utils/auth/useOidcProviders";

interface Props {
  destination?: string;
}

/**
 * One button per configured workforce provider (ADR-0011 §6).
 *
 * The list is whatever the backend just described, so an operator adds a
 * provider by changing configuration and restarting -- never by shipping a new
 * bundle. With none configured this renders nothing at all, and CARE's own
 * username/password form beside it is untouched either way.
 *
 * `display_name` is operator-supplied text. It is rendered as text: React
 * escapes it, and nothing here interpolates it into a URL or into markup.
 */
export default function WorkforceOidcButtons({ destination = "/" }: Props) {
  const { t } = useTranslation();
  const { providers } = useOidcProviders();
  const { redirect, redirectingTo } = useOidcRedirect();

  const workforceProviders = providersFor(providers, "workforce");
  if (!workforceProviders.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase tracking-wide text-gray-500">
          {t("or")}
        </span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <ul className="space-y-2">
        {workforceProviders.map((provider) => (
          <li key={provider.id}>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={redirectingTo !== null}
              onClick={() => {
                void redirect(provider, destination).catch(() => undefined);
              }}
            >
              {redirectingTo === provider.id
                ? t("redirecting")
                : t("continue_with_provider", {
                    provider: provider.display_name,
                  })}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
