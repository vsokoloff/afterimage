import type { RootCauseModelInput, RootCauseModelProvider } from '../model-provider.ts'
import type { RootCauseModelOutput } from '../types.ts'

/** Safe fallback provider — always returns unknown without calling an external model. */
export function createUnknownRootCauseProvider(): RootCauseModelProvider {
  return {
    name: 'unknown-static',
    async analyze(_input: RootCauseModelInput): Promise<RootCauseModelOutput> {
      return {
        rootCauseType: 'unknown',
        title: 'Unknown root cause',
        explanation:
          'Root-cause analysis is disabled or no model provider is configured.',
        confidence: 0,
        affectedComponent: 'unknown',
        evidenceEventIds: [],
      }
    },
  }
}
