import { GoogleGenAI, Type, Part } from "@google/genai";
import { createClient, User } from '@supabase/supabase-js';
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

// --- TYPE DEFINITIONS (Copied from frontend for consistency) ---
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      energy_bills: {
        Row: { id: number; user_id: string; company: string; installation_number: string; bill_class: string; date: string; due_date: string | null; cost: number; consumption: number; compensated_energy_kwh: number; unit_price: number; generation_balance_kwh: number; contracted_discount: number | null; paid: boolean; compensated_energy_type: 'INTERNA' | 'EXTERNA' }
        Insert: { id?: number; user_id: string; company: string; installation_number: string; bill_class: string; date: string; due_date?: string | null; cost: number; consumption: number; compensated_energy_kwh: number; unit_price: number; generation_balance_kwh: number; contracted_discount?: number | null; paid?: boolean; compensated_energy_type?: 'INTERNA' | 'EXTERNA' }
        Update: { id?: number; user_id?: string; company?: string; installation_number?: string; bill_class?: string; date?: string; due_date?: string | null; cost?: number; consumption?: number; compensated_energy_kwh?: number; unit_price?: number; generation_balance_kwh?: number; contracted_discount?: number | null; paid?: boolean; compensated_energy_type?: 'INTERNA' | 'EXTERNA' }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

interface GeminiBillData {
    company: string;
    installationNumber: string;
    billClass: string;
    date: string;
    dueDate: string | null;
    cost: number;
    consumption: number;
    compensatedEnergyKwh: number;
    unitPrice: number;
    generationBalanceKwh: number;
}

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

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // --- Check for Environment Variables ---
    const { API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    if (!API_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'A chave da API do Gemini não está configurada.' }) };
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: 'As credenciais do Supabase não estão configuradas.' }) };
    }
    
    // --- Check for User Authentication ---
    const { user } = context.clientContext || {};
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Acesso não autorizado. Por favor, faça login.' }) };
    }

    try {
        const { files } = JSON.parse(event.body || '{}');
        if (!files || !Array.isArray(files) || files.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Nenhum arquivo foi enviado.' }) };
        }

        // --- Step 1: Call Gemini API ---
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const fileParts: Part[] = files.map((file: { mimeType: string; data: string; }) => ({
            inlineData: { mimeType: file.mimeType, data: file.data },
        }));
        const textPart = { text: "Você é um assistente especialista em gerenciamento de energia. Analise cada um dos seguintes arquivos (faturas em formato de imagem ou PDF). Para cada arquivo, extraia as seguintes informações: Nome do titular, Número da Instalação, Classe/Subclasse, Período de Referência (como AAAA-MM), Data de Vencimento (como AAAA-MM-DD), Valor a Pagar (R$), Consumo de Energia (kWh), Quantidade de Energia Compensada (kWh), Preço Unitário (R$/kWh), e Saldo Atual de Geração (kWh). Forneça a resposta como um array JSON que corresponda ao esquema fornecido. Se um valor não puder ser encontrado, omita o campo ou use um valor nulo." };
        
        const geminiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [textPart, ...fileParts] },
            config: { responseMimeType: "application/json", responseSchema: responseSchema },
        });

        const extractedData: Partial<GeminiBillData>[] = JSON.parse(geminiResponse.text);

        // --- Step 2: Save to Supabase ---
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        
        let addedCount = 0;
        let duplicateCount = 0;
        let ignoredCount = 0;

        for (const billData of extractedData) {
            if (!billData.date || !billData.installationNumber) {
                ignoredCount++;
                continue;
            }

            const newBillForDb: Database['public']['Tables']['energy_bills']['Insert'] = {
                user_id: user.sub, // user.sub contains the user's UUID
                company: billData.company || "Não identificado",
                installation_number: billData.installationNumber,
                bill_class: billData.billClass || "N/A",
                date: billData.date,
                due_date: billData.dueDate || null,
                cost: billData.cost || 0,
                consumption: billData.consumption || 0,
                compensated_energy_kwh: billData.compensatedEnergyKwh || 0,
                unit_price: billData.unitPrice || 0,
                generation_balance_kwh: billData.generationBalanceKwh || 0,
            };

            const { error } = await supabase.from('energy_bills').insert(newBillForDb);
            if (error) {
                if (error.code === '23505') { // unique_violation
                    duplicateCount++;
                } else {
                    throw error; // Throw other DB errors to be caught below
                }
            } else {
                addedCount++;
            }
        }

        // --- Step 3: Return Success Response ---
        let message = '';
        if (addedCount > 0) message += `${addedCount} conta(s) adicionada(s).\n`;
        if (duplicateCount > 0) message += `${duplicateCount} conta(s) duplicada(s) ignorada(s).\n`;
        if (ignoredCount > 0) message += `${ignoredCount} conta(s) ignorada(s) por falta de dados.\n`;

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message.trim() || "Nenhuma conta nova para adicionar." }),
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