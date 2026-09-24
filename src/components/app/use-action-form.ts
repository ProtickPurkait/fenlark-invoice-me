"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/lib/errors";

/**
 * react-hook-form + zod on the client, same schema re-validated by the server
 * action. The action receives the raw form values (schema input), so
 * transforms run exactly once — on the server.
 */
export function useActionForm<TSchema extends z.ZodType<unknown, FieldValues>, TResult>(opts: {
  schema: TSchema;
  defaultValues: DefaultValues<z.input<TSchema>>;
  action: (values: z.input<TSchema>) => Promise<ActionResult<TResult>>;
  successMessage?: string | ((data: TResult) => string | null);
  onSuccess?: (data: TResult, form: UseFormReturn<z.input<TSchema>>) => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<TSchema>>({
    // The resolver only validates here; submitted values are the raw inputs.
    resolver: zodResolver(opts.schema as never) as never,
    defaultValues: opts.defaultValues,
    mode: "onTouched",
  });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      const result = await opts.action(values);
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [name, message] of Object.entries(result.fieldErrors)) {
            form.setError(name as Path<z.input<TSchema>>, { message });
          }
        }
        toast.error(result.error);
        return;
      }
      const message =
        typeof opts.successMessage === "function" ? opts.successMessage(result.data) : (opts.successMessage ?? result.message);
      if (message) toast.success(message);
      form.reset(values);
      opts.onSuccess?.(result.data, form);
    });
  });

  return { form, onSubmit, pending, errors: form.formState.errors };
}

/** First error message for a (possibly nested) field path. */
export function errorAt(errors: unknown, path: string): string | undefined {
  let node: unknown = errors;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  const message = (node as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : undefined;
}
