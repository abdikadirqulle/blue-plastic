import 'server-only'
import bcrypt from 'bcryptjs'

const COST = 12

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, COST)

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash)

/**
 * Burn roughly the same time as a real verification when the account does not
 * exist, so response timing does not enumerate registered email addresses.
 */
export async function fakeVerify(): Promise<void> {
  await bcrypt.compare('timing-equalisation', '$2a$12$K8HqZ5xJm3vQZ1YlqQqX8u1kYqfF9r0Q5r7fZ7d6ZpQ3zXH8mVdyu')
}
