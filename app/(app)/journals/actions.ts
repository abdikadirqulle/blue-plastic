'use server'

import { revalidatePath } from 'next/cache'

import { toFormState, type FormState } from '@/components/forms/action-state'
import { manualJournalSchema, reverseJournalSchema } from '@/lib/validation/accounting'
import { action } from '@/server/action'
import * as journalService from '@/server/services/journal.service'

function revalidateLedger() {
  revalidatePath('/journals')
  revalidatePath('/accounts')
  revalidatePath('/reports/trial-balance')
}

export const postManualJournal = action
  .requires('journal:post')
  .input(manualJournalSchema)
  .handler(async (ctx, input) => {
    const journal = await journalService.createManual(ctx, input)
    revalidateLedger()
    return { id: journal.id, journalNumber: journal.journalNumber, total: journal.total }
  })

export const reverseJournalAction = action
  .requires('journal:reverse')
  .input(reverseJournalSchema)
  .handler(async (ctx, input) => {
    const reversal = await journalService.reverse(ctx, input)
    revalidateLedger()
    revalidatePath(`/journals/${input.journalId}`)
    return { id: reversal.id, journalNumber: reversal.journalNumber }
  })

/**
 * The manual journal form posts JSON rather than flat FormData: its line grid is
 * an array, and flattening then re-parsing it would only invent a chance to lose
 * a line.
 */
export async function postManualJournalForm(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { status: 'error', message: 'The entry could not be read. Please try again.' }
  }

  const result = await postManualJournal(parsed)
  return toFormState(
    result,
    result.ok && 'journalNumber' in result.data
      ? `Journal ${result.data.journalNumber} posted.`
      : 'Journal posted.',
  )
}
