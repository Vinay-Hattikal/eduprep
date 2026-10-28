"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Like useActionState with `<form action>`, but without React's automatic form reset.
 * With `action={fn}`, React 19 clears uncontrolled fields after every submit, so a server-side
 * validation error would wipe what the user typed. Long forms use this instead.
 */
export function useFormSubmit<State>(
  action: (state: Awaited<State>, formData: FormData) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Keep the clicked button's name/value, as a native submit would.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return [state, onSubmit, pending] as const;
}
