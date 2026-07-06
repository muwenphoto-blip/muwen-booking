export function isMissingRelationError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

export function isMissingColumnError(message: string, column?: string): boolean {
  const msg = message.toLowerCase();
  if (!msg.includes('does not exist') && !msg.includes('column')) return false;
  if (column) return msg.includes(column.toLowerCase());
  return msg.includes('column');
}
