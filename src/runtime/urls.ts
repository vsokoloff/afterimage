export function incidentDetailUrl(webBaseUrl: string, incidentId: string): string {
  return `${webBaseUrl.replace(/\/$/, '')}/#/incidents/${incidentId}`
}
