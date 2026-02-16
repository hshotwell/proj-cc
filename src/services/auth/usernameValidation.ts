// Profanity word list (basic list - extend as needed)
const PROFANITY_LIST = new Set([
  // Slurs and hate speech
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'spic', 'kike',
  'chink', 'gook', 'wetback', 'beaner', 'cracker', 'honky', 'dyke', 'tranny',
  // Common profanity
  'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'shitty',
  'bullshit', 'bitch', 'bastard', 'asshole', 'ass', 'cunt', 'cock', 'dick',
  'pussy', 'whore', 'slut', 'penis', 'vagina', 'boob', 'tits', 'titties',
  // Variations and leetspeak
  'fck', 'fuk', 'phuck', 'sh1t', 'b1tch', 'a55', 'd1ck', 'c0ck', 'p00sy',
  'n1gger', 'n1gga', 'f4g', 'f4ggot',
  // Additional offensive terms
  'nazi', 'hitler', 'kkk', 'rape', 'rapist', 'pedo', 'pedophile',
  // Scam/impersonation prevention
  'admin', 'administrator', 'moderator', 'mod', 'support', 'staff',
  'official', 'system', 'sternhalma',
]);

// Reserved usernames
const RESERVED_USERNAMES = new Set([
  'guest', 'anonymous', 'user', 'player', 'admin', 'root', 'system',
  'moderator', 'support', 'help', 'info', 'contact', 'about', 'api',
  'www', 'mail', 'email', 'test', 'demo', 'null', 'undefined', 'true', 'false',
]);

export interface UsernameValidationResult {
  valid: boolean;
  error?: string;
}

// Check if username contains profanity
function containsProfanity(username: string): boolean {
  const lower = username.toLowerCase();

  if (PROFANITY_LIST.has(lower)) return true;

  for (const word of PROFANITY_LIST) {
    if (lower.includes(word)) return true;
  }

  const normalized = lower
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');

  for (const word of PROFANITY_LIST) {
    if (normalized.includes(word)) return true;
  }

  return false;
}

// Check if username is reserved
function isReserved(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

// Validate username format
function validateFormat(username: string): UsernameValidationResult {
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 20) {
    return { valid: false, error: 'Username must be 20 characters or less' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  if (!/^[a-zA-Z]/.test(username)) {
    return { valid: false, error: 'Username must start with a letter' };
  }
  if (/[-_]{2,}/.test(username)) {
    return { valid: false, error: 'Username cannot have consecutive underscores or hyphens' };
  }
  return { valid: true };
}

// Client-side validation (without database check)
export function validateUsernameFormat(username: string): UsernameValidationResult {
  const formatResult = validateFormat(username);
  if (!formatResult.valid) {
    return formatResult;
  }

  if (isReserved(username)) {
    return { valid: false, error: 'This username is reserved' };
  }

  if (containsProfanity(username)) {
    return { valid: false, error: 'Username contains inappropriate content' };
  }

  return { valid: true };
}
