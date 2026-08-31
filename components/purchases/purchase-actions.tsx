'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck2Icon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { convertOrder } from '@/app/(app)/purchases/actions'

export function ReceiveOrderButton({
  id,
  number,
  today,
}: {
  id: string
  number: string
  today: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await convertOrder({ id, date: today })
          if (result.ok) {
            toast.success(`${number} became bill ${result.data.number}.`)
            router.push(`/purchases/bills/${result.data.id}`)
            router.refresh()
          } else {
            toast.error(result.error.message)
          }
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <FileCheck2Icon />}
      Receive and bill
    </Button>
  )
}
