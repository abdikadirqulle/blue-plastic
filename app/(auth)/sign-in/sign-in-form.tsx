"use client"

import { useActionState } from "react"

import { Field, fieldProps } from "@/components/forms/field"
import { FormError } from "@/components/forms/form-error"
import { SubmitButton } from "@/components/forms/submit-button"
import { Input } from "@/components/ui/input"
import { signInAction, type SignInState } from "./actions"

const initialState: SignInState = {}

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <Field
        name="email"
        label="Email"
        required
        error={state.fieldErrors?.email}
      >
        <Input
          {...fieldProps("email", state.fieldErrors?.email)}
          type="email"
          autoComplete="username"
          autoFocus
          required
          value="abdisalam@blueplastic.so"
        />
      </Field>

      <Field
        name="password"
        label="Password"
        required
        error={state.fieldErrors?.password}
      >
        <Input
          {...fieldProps("password", state.fieldErrors?.password)}
          type="password"
          autoComplete="current-password"
          required
          value="blueplastic1234"
        />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  )
}
