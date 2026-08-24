/**
 * Static mascot lookup — operational data comes from /api/agents.
 */
export const agentCatalog = {
  auth: { characterId: 'auth' },
  appy: { characterId: 'appy' },
  test: { characterId: 'test' },
  research: { characterId: 'research' },
  frontend: { characterId: 'frontend' },
  data: { characterId: 'data' },
  ops: { characterId: 'ops' },
  subprocess: { characterId: 'ops' },
}

/** @param {string | null | undefined} characterId */
export function characterIdForAgent(characterId, agentId) {
  if (characterId) return characterId
  if (agentId?.startsWith('codex:')) return null
  return null
}
