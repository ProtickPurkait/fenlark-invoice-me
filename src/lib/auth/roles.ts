export type UserRole = "owner" | "admin" | "staff" | "viewer";

export const ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full access. Cannot be removed." },
  { value: "admin", label: "Admin", description: "Full access, including settings, users and payment gateways." },
  { value: "staff", label: "Staff", description: "Create and send documents, manage clients and record payments." },
  { value: "viewer", label: "Viewer", description: "Read-only access to documents and reports (e.g. your accountant)." },
];

export type Permission =
  | "documents:write"
  | "payments:write"
  | "clients:write"
  | "settings:write"
  | "users:manage"
  | "gateways:manage";

const GRANTS: Record<UserRole, Permission[]> = {
  owner: ["documents:write", "payments:write", "clients:write", "settings:write", "users:manage", "gateways:manage"],
  admin: ["documents:write", "payments:write", "clients:write", "settings:write", "users:manage", "gateways:manage"],
  staff: ["documents:write", "payments:write", "clients:write"],
  viewer: [],
};

export function can(role: UserRole, permission: Permission): boolean {
  return GRANTS[role]?.includes(permission) ?? false;
}

export function roleLabel(role: UserRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}
