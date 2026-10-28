"use client";

import { changePasswordAction, type PasswordState } from "@/app/(student)/account/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { PASSWORD_MIN } from "@/lib/auth/credentials";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, onSubmit, pending] = useFormSubmit<PasswordState>(changePasswordAction, {});
  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      {state.done ? (
        <Alert>
          <AlertDescription>Password saved. Other devices were signed out.</AlertDescription>
        </Alert>
      ) : null}
      {state.error && !state.field ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {hasPassword ? (
        <FormField
          id="current"
          label="Current password"
          error={state.field === "current" ? state.error : undefined}
        >
          {(aria) => (
            <Input
              {...aria}
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </FormField>
      ) : null}
      <FormField
        id="new-password"
        label={hasPassword ? "New password" : "Password"}
        description={`At least ${PASSWORD_MIN} characters.`}
        error={state.field === "password" ? state.error : undefined}
      >
        {(aria) => (
          <Input {...aria} name="password" type="password" autoComplete="new-password" required />
        )}
      </FormField>
      <Button type="submit" size="sm" disabled={pending}>
        {hasPassword ? "Change password" : "Set password"}
      </Button>
    </form>
  );
}
