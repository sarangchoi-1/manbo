import html2canvas from "html2canvas";
import React, { useRef } from "react";

export default function ShareableAnalysis({ analysis }: { analysis: unknown }) {
  const analysisRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!analysisRef.current) return;
    const canvas = await html2canvas(analysisRef.current);
    const link = document.createElement("a");
    link.download = "chatroom-analysis.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div>
      <div ref={analysisRef} style={{ background: "#fff", padding: 24 }}>
        {/* Render your analysis here, styled as you want it to appear in the image */}
        {/* Example: */}
        <h2>Chatroom Analysis</h2>
        <pre>{JSON.stringify(analysis, null, 2)}</pre>
      </div>
      <button onClick={handleDownload}>Download as Image</button>
    </div>
  );
}
