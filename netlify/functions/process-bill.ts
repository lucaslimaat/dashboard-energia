import { GoogleGenAI, Type, Part } from "@google/genai";
import type { Handler, HandlerEvent } from "@netlify/functions";

// Schema for the expected AI response
const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        company: { type: Type.STRING, description: "O nome da empresa ou titular da conta." },
        installationNumber: { type: Type.STRING, description: "O número da instalação ou da unidade consumidora." },
        billClass: { type: Type.STRING, description: "A classe ou subclasse de consumo (ex: Comercial, Residencial)." },
        date: { type: Type.STRING, description: "O mês de referência da conta no formato 'AAAA-MM'." },
        dueDate: { type: Type.STRING, description: "A data de vencimento da conta no formato 'AAAA-MM-DD'." },
        cost: { type: Type.NUMBER, description: "O valor total a pagar da conta em Reais (BRL)." },
        consumption: { type: Type.NUMBER, description: "O consumo total de energia em kWh." },
        compensatedEnergyKwh: { type: Type.NUMBER, description: "A quantidade de energia compensada (Geração Distribuída) em kWh." },
        unitPrice: { type: Type.NUMBER, description: "O preço unitário da energia (Tarifa de Energia - TE) em R$/kWh." },
        generationBalanceKwh: { type: Type.NUMBER, description: "O saldo atual de créditos de geração de energia em kWh." },
      },
      required: ["company", "date", "cost", "consumption", "installationNumber"]
    }
};

const handler: Handler = async (event: HandlerEvent) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    if (!process.env.API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'A chave da API do Gemini não está configurada no ambiente do servidor.' }),
        };
    }

    try {
        const { files } = JSON.parse(event.body || '{}');

        if (!files || !Array.isArray(files) || files.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Nenhum arquivo foi enviado para processamento.' }),
            };
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const fileParts: Part[] = files.map((file: { mimeType: string; data: string; }) => ({
            inlineData: {
                mimeType: file.mimeType,
                data: file.data,
            },
        }));

        const textPart = {
            text: "Você é um assistente especialista em gerenciamento de energia. Analise cada um dos seguintes arquivos (faturas em formato de imagem ou PDF). Para cada arquivo, extraia as seguintes informações: Nome do titular, Número da Instalação, Classe/Subclasse, Período de Referência (como AAAA-MM), Data de Vencimento (como AAAA-MM-DD), Valor a Pagar (R$), Consumo de Energia (kWh), Quantidade de Energia Compensada (kWh), Preço Unitário (R$/kWh), e Saldo Atual de Geração (kWh). Forneça a resposta como um array JSON que corresponda ao esquema fornecido. Se um valor não puder ser encontrado, omita o campo ou use um valor nulo."
        };

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [textPart, ...fileParts] },
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: response.text, // The response text is already a JSON string
        };

    } catch (error: any) {
        console.error("Erro na função Netlify 'process-bill':", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'Ocorreu um erro interno no servidor.' }),
        };
    }
};

export { handler };
