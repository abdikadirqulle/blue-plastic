import { z } from 'zod'

import { calendarDate, cuid, moneyString, optionalText, requiredText } from './common'

export const transferSchema = z
  .object({
    date: calendarDate,
    fromAccountId: cuid,
    toAccountId: cuid,
    amount: moneyString.refine((v) => Number(v) > 0, 'Enter an amount greater than zero'),
    reference: optionalText(60),
    memo: optionalText(500),
  })
  .refine((input) => input.fromAccountId !== input.toAccountId, {
    message: 'Choose two different accounts — a transfer to itself moves nothing',
    path: ['toAccountId'],
  })

export type TransferInput = z.infer<typeof transferSchema>

export const depositSchema = z.object({
  date: calendarDate,
  bankAccountId: cuid,
  reference: optionalText(60),
  memo: optionalText(500),
  /** Customer payments being taken to the bank. */
  paymentIds: z.array(cuid).max(500).default([]),
  /** Anything else on the paying-in slip. */
  otherLines: z
    .array(
      z.object({
        accountId: cuid,
        description: optionalText(300),
        amount: moneyString.refine((v) => Number(v) > 0, 'Enter an amount'),
      }),
    )
    .max(100)
    .default([]),
})

export type DepositInput = z.infer<typeof depositSchema>


/* --- Statement import ----------------------------------------------------- */

export const importStatementSchema = z.object({
  accountId: cuid,
  csv: z.string().min(1, 'Upload a statement first').max(4_000_000),
})

export const matchTransactionSchema = z.object({
  importedId: cuid,
  journalLineId: cuid,
})

export const excludeTransactionSchema = z.object({ importedId: cuid })

/* --- Reconciliation ------------------------------------------------------- */

export const startReconciliationSchema = z.object({
  accountId: cuid,
  statementDate: calendarDate,
  statementEndingBalance: z.string().trim().regex(/^-?\d{1,15}(\.\d{1,4})?$/, 'Enter the closing balance'),
})

export const toggleClearedSchema = z.object({
  reconciliationId: cuid,
  journalLineId: cuid,
  cleared: z.coerce.boolean(),
})

export const finishReconciliationSchema = z.object({
  reconciliationId: cuid,
  notes: optionalText(1000),
})

export const undoReconciliationSchema = z.object({
  id: cuid,
  reason: requiredText('Reason', 300),
})
