"use client";

import { Ellipsis, Mail, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inviteUser, resendInvite, updateOwnName, updateUser } from "@/app/(app)/settings/actions";
import { errorAt, useActionForm } from "@/components/app/use-action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLES, type UserRole } from "@/lib/auth/roles";
import { inviteSchema } from "@/lib/validation/settings";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
}

export function TeamManager({ members, currentUserId, canManage }: { members: TeamMember[]; currentUserId: string; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const me = members.find((m) => m.id === currentUserId);

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(result.message ?? "Done");
      else toast.error(result.error ?? "Failed");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {me ? <OwnName name={me.name} /> : null}
      <Card>
        <CardHeader
          title="Team"
          description="Everyone signs in with a one-time code sent to their email."
          action={canManage ? <InviteDialog /> : null}
        />
        <Table>
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Role</TH>
              <TH>Last sign-in</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>
                  <p className="font-medium text-zinc-900">{m.name || m.email}</p>
                  {m.name ? <p className="text-xs text-zinc-500">{m.email}</p> : null}
                </TD>
                <TD>
                  {canManage && m.role !== "owner" && m.id !== currentUserId ? (
                    <Select
                      className="h-8 w-32"
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => run(() => updateUser({ userId: m.id, role: e.target.value as "admin" | "staff" | "viewer" }))}
                    >
                      {ROLES.filter((r) => r.value !== "owner").map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="capitalize">{m.role}</span>
                  )}
                  {!m.active ? (
                    <Badge tone="muted" className="ml-2">
                      Deactivated
                    </Badge>
                  ) : null}
                </TD>
                <TD className="text-zinc-500">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never"}</TD>
                <TD align="right">
                  {canManage && m.role !== "owner" && m.id !== currentUserId ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Actions">
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {m.active ? (
                          <DropdownMenuItem onSelect={() => run(() => resendInvite(m.id))}>
                            <Mail /> Send sign-in link
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {m.active ? (
                          <DropdownMenuItem destructive onSelect={() => run(() => updateUser({ userId: m.id, active: false }))}>
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => run(() => updateUser({ userId: m.id, active: true }))}>Reactivate</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Roles" />
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r.value}>
                <dt className="text-sm font-medium text-zinc-900">{r.label}</dt>
                <dd className="text-sm text-zinc-500">{r.description}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function OwnName({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader title="Your name" description="Shown in the activity log and on emails you send." />
      <CardBody className="flex items-end gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="max-w-sm" aria-label="Your name" />
        <Button
          variant="outline"
          loading={pending}
          disabled={value === name}
          onClick={() =>
            startTransition(async () => {
              const r = await updateOwnName(value);
              if (r.ok) toast.success("Saved");
              else toast.error(r.error);
            })
          }
        >
          Save
        </Button>
      </CardBody>
    </Card>
  );
}

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: inviteSchema,
    defaultValues: { email: "", name: "", role: "staff" },
    action: inviteUser,
    onSuccess: (_d, f) => {
      f.reset({ email: "", name: "", role: "staff" });
      setOpen(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite a team member" description="They'll get an email with a link to sign in.">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="invite-email" required error={errorAt(errors, "email")}>
            <Input id="invite-email" type="email" autoFocus {...form.register("email")} />
          </Field>
          <Field label="Name" htmlFor="invite-name" error={errorAt(errors, "name")}>
            <Input id="invite-name" {...form.register("name")} />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select id="invite-role" {...form.register("role")}>
              {ROLES.filter((r) => r.value !== "owner").map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.description}
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
