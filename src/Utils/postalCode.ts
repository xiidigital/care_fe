export type PostalCodePresentation = {
  label: string;
  placeholder: string;
  pattern: string;
  maxLength: number;
};

const DEFAULT_POSTAL_CODE: PostalCodePresentation = {
  label: "Postal code",
  placeholder: "Enter postal code",
  pattern: "[A-Za-z0-9 -]{2,12}",
  maxLength: 12,
};

const POSTAL_CODES: Record<string, PostalCodePresentation> = {
  IN: {
    label: "PIN code",
    placeholder: "Enter PIN code",
    pattern: "\\d{6}",
    maxLength: 6,
  },
  MX: {
    label: "Código postal",
    placeholder: "Ingresa el código postal",
    pattern: "\\d{5}",
    maxLength: 5,
  },
  US: {
    label: "ZIP code",
    placeholder: "Enter ZIP code",
    pattern: "\\d{5}(-\\d{4})?",
    maxLength: 10,
  },
};

export const getPostalCodePresentation = (countryCode?: string | null) =>
  POSTAL_CODES[countryCode?.toUpperCase() ?? ""] ?? DEFAULT_POSTAL_CODE;
