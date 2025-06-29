interface WebResult {
  topic: string;
  results: { title: string; snippet: string; url: string }[];
}

interface Character {
  name: string;
  work: string;
  description: string;
}

export function formatRagPrompt(chatText: string, webResults: WebResult[], characterDb: Character[]): string {
  const webSection = webResults.map(
    ({ topic, results }) =>
      `# ${topic}\n` +
      results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet} (${r.url})`).join('\n')
  ).join('\n\n');

  const characterSection = characterDb
    .map((c) => `- ${c.name} (${c.work}): ${c.description}`)
    .join('\n');

  return `
아래는 채팅방 대화 기록, 최신 웹에서 찾은 밈/유행어/트렌드, 그리고 클래식 캐릭터/밈 데이터야.
이걸 참고해서, 시상식(어워즈) 부분을 진짜 웃기고, 요즘 감성+밈+드립으로 가득하게 만들어 줘.
웹에서 찾은 밈/트렌드는 [최신 밈/트렌드]로, 로컬 DB는 [클래식 캐릭터/밈]으로 구분해서 참고해.

[채팅방 대화 기록]
${chatText}

[최신 밈/트렌드]
${webSection}

[클래식 캐릭터/밈]
${characterSection}

예시:
- "최다 웃음상: 민수 (ㅋㅋ, ㅎㅎ 남발. 이 정도면 웃음 공장장임) [최신 밈: 'ㅋㅋ무새']"
- "밈 장인상: 지현 (유행어 장착 완료, 밈 없으면 대화 못 함 ㅋㅋ) [클래식: 박명수st]"
- "눈치 제로상: 수빈 (상황 파악 못 하고 혼자 딴소리하는 거 국보급) [최신 밈: '눈치 챙겨~']"
`;
}
