'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function DateRangeForm({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const [start, setStart] = useState(from)
  const [end, setEnd] = useState(to)

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        router.push(`?from=${start}&to=${end}`)
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="from">From</Label>
        <Input id="from" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="to">To</Label>
        <Input id="to" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
      </div>
      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  )
}
