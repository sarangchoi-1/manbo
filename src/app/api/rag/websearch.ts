import axios from "axios";

interface BingWebPage {
  name: string;
  snippet: string;
  url: string;
}

export async function webSearch(topics: string[]): Promise<{ topic: string, results: { title: string, snippet: string, url: string }[] }[]> {
  const apiKey = process.env.BING_API_KEY!;
  const endpoint = "https://api.bing.microsoft.com/v7.0/search";
  const allResults = [];
  for (const topic of topics) {
    const { data } = await axios.get(endpoint, {
      params: { q: topic, count: 2 },
      headers: { "Ocp-Apim-Subscription-Key": apiKey }
    });
    const results = (data.webPages?.value as BingWebPage[] || []).map((item) => ({
      title: item.name,
      snippet: item.snippet,
      url: item.url
    }));
    allResults.push({ topic, results });
  }
  return allResults;
}
