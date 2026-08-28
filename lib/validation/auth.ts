import { z } from 'zod'

import { currencyCode, email, password, requiredText } from './common'

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

export type SignInInput = z.infer<typeof signInSchema>

/** First-run setup: creates the organisation and its owner in one step. */
export const setupSchema = z
  .object({
    organizationName: requiredText('Organisation name', 200),
    baseCurrency: currencyCode.default('USD'),
    fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).default(1),
    name: requiredText('Your name', 120),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type SetupInput = z.infer<typeof setupSchema>
