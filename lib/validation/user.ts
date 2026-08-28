import { z } from 'zod'

import { ASSIGNABLE_ROLES } from '@/lib/roles'
import { cuid, email, password, requiredText } from './common'

const assignableRole = z.enum(ASSIGNABLE_ROLES as [string, ...string[]])

export const inviteUserSchema = z.object({
  name: requiredText('Name', 120),
  email,
  role: assignableRole,
  /**
   * Email delivery does not exist yet, so an invited user is created with a
   * password set by the inviter. Phase 10 replaces this with a signed invitation
   * link; the shape of this action does not change.
   */
  temporaryPassword: password,
})

export type InviteUserInput = z.infer<typeof inviteUserSchema>

export const updateMemberRoleSchema = z.object({
  membershipId: cuid,
  role: assignableRole,
})

export const membershipIdSchema = z.object({ membershipId: cuid })

export const updateProfileSchema = z.object({
  name: requiredText('Name', 120),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
