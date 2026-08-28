export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** Currencies offered in settings. The ledger supports any ISO code; this is the shortlist. */
export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'KES', label: 'Kenyan Shilling' },
  { code: 'SOS', label: 'Somali Shilling' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'CNY', label: 'Chinese Yuan' },
] as const

export const TIME_ZONES = [
  'UTC',
  'Africa/Nairobi',
  'Africa/Mogadishu',
  'Africa/Lagos',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Amsterdam',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
] as const
