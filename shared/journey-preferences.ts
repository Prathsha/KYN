export const journeyPreferences=['Quiet walk preferred','Conversation welcome','Relaxed walking pace','Help with subway directions','Step-free route preferred'] as const;
export type JourneyPreference=typeof journeyPreferences[number];
export function preferenceNote(values:readonly string[]){return journeyPreferences.filter(v=>values.includes(v)).join('\n')}
