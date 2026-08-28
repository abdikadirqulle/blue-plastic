import type { Metadata } from 'next'
import { UsersIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/empty-state'
import { Pagination } from '@/components/data/pagination'
import { SearchInput } from '@/components/data/search-input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/date'
import { parseListQuery } from '@/lib/validation/common'
import { requireOrgContext } from '@/server/auth/context'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/roles'
import * as membershipService from '@/server/services/membership.service'
import { InviteUserDialog } from './invite-user-dialog'
import { MemberActions } from './member-actions'

export const metadata: Metadata = { title: 'Users' }

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrgContext('user:read')
  const query = parseListQuery(await searchParams)
  const { rows, total, page, pageCount, pageSize } = await membershipService.list(ctx, query)

  const canInvite = ctx.permissions.has('user:invite')
  const canUpdate = ctx.permissions.has('user:update')
  const canRemove = ctx.permissions.has('user:remove')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput placeholder="Search by name or email" />
        {canInvite ? <InviteUserDialog roles={[...ASSIGNABLE_ROLES]} /> : null}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={query.q ? 'No members match that search' : 'No members yet'}
          description={
            query.q
              ? 'Try a different name or email address.'
              : 'Add the people who need access to the books.'
          }
          action={canInvite && !query.q ? <InviteUserDialog roles={[...ASSIGNABLE_ROLES]} /> : undefined}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last signed in</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => {
                const isSelf = member.user.id === ctx.userId
                const isOwner = member.role === 'OWNER'

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <span className="block font-medium">
                        {member.user.name}
                        {isSelf ? <span className="ml-2 text-xs text-muted-foreground">you</span> : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">{member.user.email}</span>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[member.role]}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.status === 'ACTIVE'
                            ? 'success'
                            : member.status === 'SUSPENDED'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {member.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.user.lastLoginAt
                        ? formatDateTime(member.user.lastLoginAt, ctx.organization.timeZone)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {(canUpdate || canRemove) && !isOwner && !isSelf ? (
                        <MemberActions
                          membershipId={member.id}
                          role={member.role}
                          status={member.status}
                          name={member.user.name}
                          roles={[...ASSIGNABLE_ROLES]}
                          canUpdate={canUpdate}
                          canRemove={canRemove}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            basePath="/settings/users"
            params={{ q: query.q }}
          />
        </Card>
      )}
    </div>
  )
}
