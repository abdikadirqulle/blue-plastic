'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setAccountActive } from './actions'
import { EditAccountDialog, type AccountFormValues, type ParentOption } from './account-dialog'

export function AccountRowActions({
  account,
  parents,
  canEdit,
  canArchive,
}: {
  account: AccountFormValues & { isActive: boolean }
  parents: ParentOption[]
  canEdit: boolean
  canArchive: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    startTransition(async () => {
      const result = await setAccountActive({ id: account.id, isActive: !account.isActive })
      if (result.ok) {
        toast.success(account.isActive ? 'Account archived.' : 'Account restored.')
        router.refresh()
      } else {
        toast.error(result.error.message)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            aria-label={`Actions for ${account.name}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canEdit ? <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem> : null}
          {canArchive && !account.isSystem ? (
            <>
              {canEdit ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                variant={account.isActive ? 'destructive' : 'default'}
                onSelect={toggle}
              >
                {account.isActive ? 'Archive' : 'Restore'}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {editing ? (
        <EditAccountDialog account={account} parents={parents} onClose={() => setEditing(false)} />
      ) : null}
    </>
  )
}
