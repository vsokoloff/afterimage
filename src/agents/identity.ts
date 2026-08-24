/**
 * Map legacy / alias agent ids onto the dashboard agent Lucid watches.
 * `subprocess` (lucid run default) is Gitty on the roster.
 */
export function canonicalDashboardAgentId(agentId: string): string {
  if (agentId === 'subprocess') return 'gitty'
  return agentId
}
