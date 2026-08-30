import careConfig from "@careConfig";
import { useEffect } from "react";

interface Props {
  disabled?: boolean;
}

export default function Sentry({ disabled }: Props) {
  useEffect(() => {
    if (disabled) return;
    const { dsn, environment } = careConfig.sentry;

    if (!dsn && !environment) return;

    if (!dsn || !environment) {
      console.error(
        "Sentry is not configured correctly. Please check your environment variables.",
      );
      return;
    }

    import("@sentry/browser").then((Sentry) => {
      Sentry.init({ dsn, environment });
    });
  }, [disabled]);

  return null;
}
