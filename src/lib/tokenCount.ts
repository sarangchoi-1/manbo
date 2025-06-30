// Fallback: Estimate token count for OpenAI models
// Roughly: 1 Korean char ≈ 1.5 tokens, 1 English word ≈ 1.3 tokens, with 100% safety margin
export function countTokens(text: string): number {
  const korean = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const english = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  const other = text.length - korean - english;
  return Math.ceil((korean * 1.5 + english * 1.3 + other) * 2.0);
}
