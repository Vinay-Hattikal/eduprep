"use client";

import { Eye, EyeOff, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  forgotPasswordAction,
  requestPhoneCodeAction,
  resendVerificationAction,
  resetPasswordAction,
  signInWithPasswordAction,
  signUpAction,
  verifyEmailAction,
  verifyPhoneCodeAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { maskPhone, PASSWORD_MIN } from "@/lib/auth/credentials";
import { cn } from "@/lib/utils";

function ErrorAlert({ state }: { state: AuthState }) {
  if (state.error && !state.field) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state.info) {
    return (
      <Alert role="status">
        <AlertDescription>{state.info}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

const fieldError = (state: AuthState, field: string) =>
  state.field === field ? state.error : undefined;

function PasswordInput({
  aria,
  name,
  autoComplete,
}: {
  aria: Record<string, unknown>;
  name: string;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        {...aria}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function CodeInput({ aria }: { aria: Record<string, unknown> }) {
  return (
    <Input
      {...aria}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      className="text-center font-mono text-lg tracking-[0.5em]"
    />
  );
}

export function SignInForm({
  next,
  devLogin,
  phone = true,
}: {
  next: string | null;
  devLogin: boolean;
  /** False in TEST_MODE: email and password only. */
  phone?: boolean;
}) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  return (
    <div className="space-y-5">
      <div
        hidden={!phone}
        role="tablist"
        aria-label="Sign in with"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
      >
        {(
          [
            ["email", "Email", Mail],
            ["phone", "Phone OTP", Smartphone],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            data-testid={`signin-tab-${id}`}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              mode === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {mode === "email" ? <EmailSignIn next={next} /> : <PhoneSignIn next={next} />}
      {devLogin ? (
        <p className="text-center text-xs text-muted-foreground">
          Development:{" "}
          <Link
            href={next ? `/dev-login?next=${encodeURIComponent(next)}` : "/dev-login"}
            className="underline"
          >
            sign in as a test account
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function EmailSignIn({ next }: { next: string | null }) {
  const [state, onSubmit, pending] = useFormSubmit<AuthState>(signInWithPasswordAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="email-signin">
      <input type="hidden" name="next" value={next ?? ""} />
      <ErrorAlert state={state} />
      <FormField id="email" label="Email" error={fieldError(state, "email")}>
        {(aria) => <Input {...aria} name="email" type="email" autoComplete="email" required />}
      </FormField>
      <FormField id="password" label="Password" error={fieldError(state, "password")}>
        {(aria) => <PasswordInput aria={aria} name="password" autoComplete="current-password" />}
      </FormField>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={pending} data-testid="signin-submit">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function PhoneSignIn({ next }: { next: string | null }) {
  const [sendState, sendSubmit, sending] = useFormSubmit<AuthState>(requestPhoneCodeAction, {});
  const [verifyState, verifySubmit, verifying] = useFormSubmit<AuthState>(
    verifyPhoneCodeAction,
    {},
  );
  const [editing, setEditing] = useState(false);
  const phone = sendState.sent && !editing ? sendState.phone : undefined;

  if (!phone) {
    return (
      <form
        onSubmit={(e) => {
          setEditing(false);
          sendSubmit(e);
        }}
        className="space-y-4"
        data-testid="phone-signin"
      >
        <ErrorAlert state={sendState} />
        <FormField
          id="phone"
          label="Mobile number"
          description="We'll text you a 6-digit code."
          error={fieldError(sendState, "phone")}
        >
          {(aria) => (
            <div className="flex">
              <span className="flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                +91
              </span>
              <Input
                {...aria}
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                required
                className="rounded-l-none"
              />
            </div>
          )}
        </FormField>
        <Button type="submit" className="w-full" disabled={sending} data-testid="send-phone-code">
          {sending ? "Sending…" : "Send code"}
        </Button>
      </form>
    );
  }
  return (
    <form onSubmit={verifySubmit} className="space-y-4" data-testid="phone-verify">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next ?? ""} />
      <p className="text-sm text-muted-foreground">
        Code sent to {maskPhone(phone)}.{" "}
        <button type="button" className="text-primary underline" onClick={() => setEditing(true)}>
          Change number
        </button>
      </p>
      <ErrorAlert state={verifyState} />
      <FormField id="code" label="6-digit code" error={fieldError(verifyState, "code")}>
        {(aria) => <CodeInput aria={aria} />}
      </FormField>
      <Button type="submit" className="w-full" disabled={verifying} data-testid="verify-phone-code">
        {verifying ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, onSubmit, pending] = useFormSubmit<AuthState>(signUpAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="signup-form">
      <ErrorAlert state={state} />
      <FormField id="name" label="Full name" error={fieldError(state, "name")}>
        {(aria) => <Input {...aria} name="name" autoComplete="name" required />}
      </FormField>
      <FormField id="email" label="Email" error={fieldError(state, "email")}>
        {(aria) => <Input {...aria} name="email" type="email" autoComplete="email" required />}
      </FormField>
      <FormField
        id="password"
        label="Password"
        description={`At least ${PASSWORD_MIN} characters.`}
        error={fieldError(state, "password")}
      >
        {(aria) => <PasswordInput aria={aria} name="password" autoComplete="new-password" />}
      </FormField>
      <Button type="submit" className="w-full" disabled={pending} data-testid="signup-submit">
        {pending ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}

export function VerifyEmailForm({ email, next }: { email: string; next: string | null }) {
  const [state, onSubmit, pending] = useFormSubmit<AuthState>(verifyEmailAction, {});
  const [resendState, resendSubmit, resending] = useFormSubmit<AuthState>(
    resendVerificationAction,
    {},
  );
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4" data-testid="verify-email-form">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ""} />
        <ErrorAlert state={state} />
        <FormField id="code" label="6-digit code" error={fieldError(state, "code")}>
          {(aria) => <CodeInput aria={aria} />}
        </FormField>
        <Button
          type="submit"
          className="w-full"
          disabled={pending}
          data-testid="verify-email-submit"
        >
          {pending ? "Checking…" : "Confirm email"}
        </Button>
      </form>
      <form onSubmit={resendSubmit} className="text-center">
        <input type="hidden" name="email" value={email} />
        <ErrorAlert state={resendState} />
        <Button type="submit" variant="link" size="sm" disabled={resending}>
          Send a new code
        </Button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, onSubmit, pending] = useFormSubmit<AuthState>(forgotPasswordAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ErrorAlert state={state} />
      <FormField id="email" label="Email" error={fieldError(state, "email")}>
        {(aria) => <Input {...aria} name="email" type="email" autoComplete="email" required />}
      </FormField>
      <Button type="submit" className="w-full" disabled={pending} data-testid="forgot-submit">
        {pending ? "Sending…" : "Send reset code"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, onSubmit, pending] = useFormSubmit<AuthState>(resetPasswordAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <ErrorAlert state={state} />
      <FormField id="code" label="6-digit code" error={fieldError(state, "code")}>
        {(aria) => <CodeInput aria={aria} />}
      </FormField>
      <FormField
        id="password"
        label="New password"
        description={`At least ${PASSWORD_MIN} characters.`}
        error={fieldError(state, "password")}
      >
        {(aria) => <PasswordInput aria={aria} name="password" autoComplete="new-password" />}
      </FormField>
      <Button type="submit" className="w-full" disabled={pending} data-testid="reset-submit">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
