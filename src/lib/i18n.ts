import type { Language } from "../types";

const labels = {
  ar: {
    appName: "Gam3eya Manager",
    dashboard: "الرئيسية",
    people: "الأشخاص",
    import: "استيراد",
    logout: "تسجيل الخروج",
    createOrganization: "إنشاء مؤسسة",
  },
  en: {
    appName: "Gam3eya Manager",
    dashboard: "Dashboard",
    people: "People",
    import: "Import",
    logout: "Logout",
    createOrganization: "Create organization",
  },
} satisfies Record<Language, Record<string, string>>;

export function t(language: Language, key: keyof typeof labels.en): string {
  return labels[language][key] || labels.en[key];
}
