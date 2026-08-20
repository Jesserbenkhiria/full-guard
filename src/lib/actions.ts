export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export function success<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function failure(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<never> {
  return { success: false, error, fieldErrors };
}

export function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getOptionalString(formData: FormData, key: string): string | undefined {
  const value = getString(formData, key);
  return value || undefined;
}

export function getBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function getStringArray(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string");
}

export function getNumber(formData: FormData, key: string): number {
  return Number(getString(formData, key));
}

export function formatZodErrors(
  issues: { path: (string | number)[]; message: string }[]
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
