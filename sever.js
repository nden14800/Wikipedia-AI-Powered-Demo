const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public')); // 'public'フォルダ内のファイルを配信

// APIキーの存在チェック
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("エラー: GEMINI_API_KEYが.envファイルに設定されていません。");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

// ストリーミングレスポンスを処理する共通関数
async function streamToClient(res, prompt) {
    try {
        const result = await model.generateContentStream(prompt);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        
        for await (const chunk of result.stream) {
            if (chunk && typeof chunk.text === 'function') {
                res.write(chunk.text());
            }
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: "AIモデルとの通信中にエラーが発生しました。" });
    } finally {
        res.end();
    }
}

// 概要生成用のAPIエンドポイント
app.post('/api/summary', async (req, res) => {
    const { context } = req.body;
    if (!context) {
        return res.status(400).json({ error: "記事のコンテキストが必要です。" });
    }
    const prompt = `あなたはWikipediaの編集アシスタントです。以下の記事の冒頭部分を読み、記事全体の内容を3〜4文で簡潔かつ正確に要約してください。\n\n---\n${context}\n---`;
    await streamToClient(res, prompt);
});

// チャット用のAPIエンドポイント
app.post('/api/chat', async (req, res) => {
    const { history } = req.body;
    if (!history || !Array.isArray(history)) {
        return res.status(400).json({ error: "チャット履歴が必要です。" });
    }

    // Google AI SDKが要求する形式に変換
    const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
    
    // 最後のメッセージをプロンプトとして取り出す
    const lastMessage = formattedHistory.pop();

    try {
        const chat = model.startChat({ history: formattedHistory });
        const result = await chat.sendMessageStream(lastMessage.parts[0].text);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        for await (const chunk of result.stream) {
            if (chunk && typeof chunk.text === 'function') {
                res.write(chunk.text());
            }
        }
    } catch (error) {
        console.error("Gemini Chat API Error:", error);
        res.status(500).json({ error: "AIモデルとの通信中にエラーが発生しました。" });
    } finally {
        res.end();
    }
});


app.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});
