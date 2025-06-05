'use client';

import { useState, FormEvent } from 'react';

type AnalysisType =
  | string
  | { [key: string]: string }
  | { file: string; content: string; analysis: string }[];

// --- Prompt Section ---
function PromptForm({ prompt, setPrompt, onSubmit, response }: {
  prompt: string, setPrompt: (v: string) => void, onSubmit: (e: FormEvent) => void, response: string
}) {
  return (
    <section>
      <h2>Prompt Generator</h2>
      <form onSubmit={onSubmit}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter your prompt here..."
        />
        <button type="submit">Generate</button>
      </form>
      {response && <div><h3>Response:</h3><p>{response}</p></div>}
    </section>
  );
}

// --- File Upload Section ---
function FileUploadForm({ onFileChange, onUpload, message }: {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onUpload: (e: React.FormEvent) => void,
  message: string
}) {
  return (
    <section>
      <h2>Upload File</h2>
      <form onSubmit={onUpload}>
        <input
          type="file"
          accept=".txt,.csv,.zip"
          onChange={onFileChange}
        />
        <button type="submit">Upload File</button>
        <p>{message}</p>
      </form>
    </section>
  );
}

// --- Analysis Section ---
function AnalysisReport({ analysis }: { analysis: AnalysisType }) {
  if (!analysis) return null;
  if (Array.isArray(analysis)) {
    return (
      <section>
        <h2>Analysis Results</h2>
        {analysis.map((item, idx) => (
          <div key={idx} style={{ marginBottom: "1.5em", padding: "1em", border: "1px solid #ccc", borderRadius: "8px" }}>
            <h3>File: {item.file}</h3>
            <p><b>Analysis:</b> {typeof item.analysis === "object" ? JSON.stringify(item.analysis, null, 2) : item.analysis}</p>
          </div>
        ))}
      </section>
    );
  }
  if (typeof analysis === "object") {
    return (
      <section>
        <h2>Analysis Report</h2>
        {Object.entries(analysis).map(([key, value]) => (
          <div key={key} style={{ marginBottom: "1.5em" }}>
            <b>{key}:</b>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
            </pre>
          </div>
        ))}
      </section>
    );
  }
  return (
    <section>
      <h2>Analysis Result</h2>
      <p>{analysis}</p>
    </section>
  );
}

// --- Chat Section ---
function ChatSection({
  chatHistory, userMessage, setUserMessage, onChatSubmit
}: {
  chatHistory: { role: string, content: string }[],
  userMessage: string,
  setUserMessage: (v: string) => void,
  onChatSubmit: (e: React.FormEvent) => void
}) {
  return (
    <section>
      <h2>Chat with AI about your file</h2>
      <div>
        {chatHistory.map((msg, idx) => (
          <div key={idx}><b>{msg.role}:</b> {msg.content}</div>
        ))}
      </div>
      <form onSubmit={onChatSubmit}>
        <input
          value={userMessage}
          onChange={e => setUserMessage(e.target.value)}
          placeholder="Ask a question about the file..."
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}

// --- Main Page Component ---
export default function Home() {
  // State
  const [prompt, setPrompt] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisType>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<{ role: string, content: string }[]>([]);
  const [userMessage, setUserMessage] = useState<string>("");

  // Handlers
  const handlePromptSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (res.ok) setResponse(data.result);
    else console.error(data.error);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
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
      body: JSON.stringify({ fileContent, chatHistory, userMessage }),
    });
    const data = await res.json();
    setChatHistory(data.chatHistory);
    setUserMessage("");
  };

  // --- Render ---
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2em" }}>
      <h1>AI File Analyzer</h1>
      <PromptForm
        prompt={prompt}
        setPrompt={setPrompt}
        onSubmit={handlePromptSubmit}
        response={response}
      />
      <FileUploadForm
        onFileChange={handleFileChange}
        onUpload={handleUploadSubmit}
        message={message}
      />
      <AnalysisReport analysis={analysis} />
      <ChatSection
        chatHistory={chatHistory}
        userMessage={userMessage}
        setUserMessage={setUserMessage}
        onChatSubmit={handleChatSubmit}
      />
    </div>
  );
}