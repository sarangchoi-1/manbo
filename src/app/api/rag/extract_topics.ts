/**
 * Extracts keywords, repeated phrases, and meme/trend candidates from chat text.
 * Returns an array of topics for RAG web search.
 */
export function extractTopics(chatText: string): string[] {
  // 1. Extract words/phrases that appear more than once (potential memes)
  const wordCounts: Record<string, number> = {};
  const words = chatText.match(/[가-힣a-zA-Z0-9#@_]+/g) || [];
  words.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });
  // 2. Get words that appear more than once and are not too short
  const frequentWords = Object.entries(wordCounts)
    .filter(([word, count]) => count > 1 && word.length > 1)
    .map(([word]) => word);

  // 3. Optionally, extract lines with lots of ㅋㅋ, ㅎㅎ, or emoji
  const memeLines = (chatText.match(/.*(ㅋㅋ+|ㅎㅎ+|[🤣😂😆]).*/g) || []).map(line => line.trim());

  // 4. Combine and deduplicate
  const topics = Array.from(new Set([...frequentWords, ...memeLines]));

  // 5. Limit to top N
  return topics.slice(0, 10);
}
