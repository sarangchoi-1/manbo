'use client';

import { useState, FormEvent } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  const [userMessage, setUserMessage] = useState<string>("");
  const [chatReply, setChatReply] = useState<string>("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();
    if (res.ok) {
      setResponse(data.result);
    } else {
      console.error(data.error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    console.log(data);
    if (res.ok) {
      setMessage("Upload successful!");
      setAnalysis(data.analysis);
      setFileContent(data.fileContent);
      setChatHistory(data.chatHistory);
    } else {
      setMessage("Upload failed.");
      setAnalysis("");
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMessage) return;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileContent,
        chatHistory,
        userMessage
      }),
    });

    const data = await res.json();
    setChatReply(data.reply);
    setChatHistory(data.chatHistory);
    setUserMessage("");
  };

  return (
    <div>
      <h1>testing testing</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt here..."
        />
        <button type="submit">Generate</button>
      </form>
      {response && <div><h2>Response:</h2><p>{response}</p></div>}
      <form onSubmit={handleUploadSubmit}>
        <input
          type="file"
          accept=".txt,.csv,.zip"
          onChange={handleFileChange}
        />
        <button type="submit">Upload File</button>
        <p>{message}</p>
      </form>
      {analysis && (
        <div>
          <h2>Analysis Result:</h2>
          <p>{analysis}</p>
        </div>
      )}
      <div>
        <h2>Chat with AI about your file:</h2>
        <div>
          {Array.isArray(chatHistory) && chatHistory.map((msg, idx) => (
            <div key={idx}><b>{msg.role}:</b> {msg.content}</div>
          ))}
          {chatReply && <div><b>assistant:</b> {chatReply}</div>}
        </div>
        <form onSubmit={handleChatSubmit}>
          <input
            value={userMessage}
            onChange={e => setUserMessage(e.target.value)}
            placeholder="Ask a question about the file..."
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}