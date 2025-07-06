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
async function streamToClient(res, resultStream) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    for await (const chunk of resultStream) {
        if (chunk && typeof chunk.text === 'function') {
            res.write(chunk.text());
        }
    }
}

// 概要生成用のAPIエンドポイント
app.post('/api/summary', async (req, res) => {
    const { context } = req.body;
    if (!context) {
        return res.status(400).json({ error: "記事のコンテキストが必要です。" });
    }
    const prompt = `あなたはWikipediaの編集アシスタントです。以下の記事の冒頭部分を読み、記事全体の内容を3〜4文で簡潔かつ正確に要約してください。\n\n---\n${context}\n---`;
    
    try {
        const result = await model.generateContentStream(prompt);
        await streamToClient(res, result.stream);
    } catch (error) {
        console.error("Gemini Summary API Error:", error);
        res.status(500).json({ error: "AIモデルとの通信中にエラーが発生しました。" });
    } finally {
        res.end();
    }
});

// チャット用のAPIエンドポイント (修正箇所)
app.post('/api/chat', async (req, res) => {
    const { history } = req.body;
    if (!history || !Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ error: "チャット履歴が不正です。" });
    }

    // Google AI SDKが要求する形式に変換
    const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));

    try {
        // 全ての履歴をコンテキストとして渡し、最後のメッセージをプロンプトとして送信する
        // SDKが内部で履歴を適切に管理してくれる
        const chat = model.startChat({ history: formattedHistory.slice(0, -1) }); // 最後のメッセージを除いた履歴で初期化
        const lastMessage = formattedHistory[formattedHistory.length - 1]; // 最後のメッセージを取得

        const result = await chat.sendMessageStream(lastMessage.parts[0].text);
        
        await streamToClient(res, result.stream);

    } catch (error) {
        // エラーメッセージに詳細を含める
        console.error("Gemini Chat API Error:", error);
        const errorMessage = error.message || "不明なエラー";
        if (errorMessage.includes("did not match the expected pattern")) {
            res.status(400).json({ error: "チャット履歴の形式が不正です。リロードしてください。" });
        } else {
            res.status(500).json({ error: `AIモデルとの通信中にエラーが発生しました: ${errorMessage}` });
        }
    } finally {
        if (!res.headersSent) {
            res.end();
        }
    }
});


app.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});
app.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});
