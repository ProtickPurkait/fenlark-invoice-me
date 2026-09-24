import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";

/** Card wrapper with a sticky save bar for settings forms. */
export function SettingsForm({
  onSubmit,
  pending,
  dirty,
  canEdit,
  children,
}: {
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  pending: boolean;
  dirty: boolean;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      {!canEdit ? (
        <Alert tone="info" className="mb-4">
          Only owners and admins can change settings.
        </Alert>
      ) : null}
      <Card className="px-6 py-8">
        <fieldset disabled={!canEdit} className="contents">
          {children}
        </fieldset>
      </Card>
      {canEdit ? (
        <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50/90 py-3 backdrop-blur">
          {dirty ? <span className="text-xs text-zinc-500">Unsaved changes</span> : null}
          <Button type="submit" loading={pending}>
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}
