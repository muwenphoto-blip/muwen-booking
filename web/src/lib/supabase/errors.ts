export function isMissingRelationError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}
