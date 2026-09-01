'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { AccountPicker } from '@/components/forms/account-picker'
import { accountOptions, type AccountChoice } from '@/lib/account-options'

/**
 * Change which account the detail is for, without going back to the report.
 *
 * Somebody who drilled into "Sales" to find out why it looks high very often
 * wants "Sales returns" next. Sending them back to the profit and loss to click
 * a different row is a round trip that answers nothing.
 */
export function AccountSwitcher({
  accounts,
  value,
  from,
  to,
}: {
  accounts: AccountChoice[]
  value: string | null
  from: string
  to: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const options = accountOptions(accounts)

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">Account</span>
      <div className="w-full max-w-md">
        <AccountPicker
          options={options}
          value={value}
          disabled={isPending}
          placeholder="Choose an account"
          onChange={(next) =>
            startTransition(() => {
              if (!next) return
              router.push(
                `/reports/transaction-detail?account=${next}&period=custom&from=${from}&to=${to}`,
              )
            })
          }
        />
      </div>
    </div>
  )
}
