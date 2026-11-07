// The logo for an AI app connecting to Kreate (consent screen, Settings → Connect your AI). Many
// apps don't send a logo when they register, so the well-known ones are recognised by name or web
// address and shown with their brand icon (Simple Icons); otherwise their own logo, else initials.

const KNOWN: { match: RegExp, icon: string }[] = [
  { match: /claude|anthropic/, icon: 'i-simple-icons-claude' },
  { match: /chatgpt|openai/, icon: 'i-simple-icons-openai' },
  { match: /gemini/, icon: 'i-simple-icons-googlegemini' },
  { match: /perplexity/, icon: 'i-simple-icons-perplexity' },
  { match: /mistral|le chat/, icon: 'i-simple-icons-mistralai' },
  { match: /cursor/, icon: 'i-simple-icons-cursor' },
  { match: /copilot/, icon: 'i-simple-icons-githubcopilot' },
  { match: /windsurf|codeium/, icon: 'i-simple-icons-windsurf' },
  { match: /vs ?code|visual studio code/, icon: 'i-simple-icons-visualstudiocode' },
  { match: /raycast/, icon: 'i-simple-icons-raycast' },
  { match: /\bpoe\b/, icon: 'i-simple-icons-poe' },
  { match: /hugging ?face/, icon: 'i-simple-icons-huggingface' },
  { match: /ollama/, icon: 'i-simple-icons-ollama' },
  { match: /lm ?studio/, icon: 'i-simple-icons-lmstudio' },
  { match: /deepseek/, icon: 'i-simple-icons-deepseek' }
]

export interface AiAppLogo {
  /** a brand icon, for an app Kreate recognises */
  icon?: string
  /** the logo the app registered with */
  src?: string
}

export function aiAppLogo(client: { name?: string | null, uri?: string | null, logo_uri?: string | null }): AiAppLogo {
  const haystack = `${client.name ?? ''} ${client.uri ?? ''}`.toLowerCase()
  const known = KNOWN.find(entry => entry.match.test(haystack))
  if (known) return { icon: known.icon }
  return client.logo_uri ? { src: client.logo_uri } : {}
}
