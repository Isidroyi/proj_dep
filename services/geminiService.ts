import { RequirementDetail, ComplianceResult, Status } from '../types';

const fileToDataUrl = async (file: File) => {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
  const mime = file.type || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
};

export const extractEntities = async (
  documentFile: File,
  limit?: number
): Promise<RequirementDetail[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const dataUrl = await fileToDataUrl(documentFile);
  const isImage = (documentFile.type || '').startsWith('image/');

  const textPrompt = `
    You are an expert system for analyzing technical documents. Your task is to process a document with technical requirements and extract entities.

    INSTRUCTIONS:
    1. Parse each row of the table in the document (PDF or image).
    2. Extract: 'id', 'parameter', 'requirement', 'source', and 'notes' (synthesize from other columns like 'Аппарат... "ТелеКОРД-7МТ"...' and 'Обоснование...'). For 'notes', if a value is 'н/д, необходим запрос производителю', note that the value is not available.
    3. Output a single JSON object with an array named 'requirements'. Adhere to the provided JSON schema.
    4. Ensure all text is extracted in Russian.
    ${limit ? `IMPORTANT: Process only the first ${limit} rows.` : ''}
  `;

  const response = await fetch('https://api.aitunnel.ru/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            isImage
              ? { type: 'image_url', image_url: { url: dataUrl } }
              : { type: 'file', file: { filename: documentFile.name || 'document', file_data: dataUrl } }
          ]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'requirements_schema',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              requirements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    parameter: { type: 'string' },
                    requirement: { type: 'string' },
                    source: { type: 'string' },
                    notes: { type: 'string' }
                  },
                  required: ['id', 'parameter', 'requirement', 'source', 'notes'],
                  additionalProperties: false
                }
              }
            },
            required: ['requirements'],
            additionalProperties: false
          }
        }
      }
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    console.error("API Error in extraction:", response.status, JSON.stringify(data, null, 2));
    let userMessage = `Ошибка API: ${data.error?.message || response.statusText}`;
     if (data.error?.code === 400 && data.error?.message === "Provider returned error") {
      userMessage = "Ошибка обработки документа (400). Пожалуйста, попробуйте другой файл. Возможно, документ поврежден, имеет слишком сложную структуру или его контент был заблокирован системой безопасности провайдера AI.";
    }
    throw new Error(userMessage);
  }

  const content = data.choices?.[0]?.message?.content;
  const jsonString = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  try {
    const parsedJson = JSON.parse(jsonString);
    return (parsedJson.requirements || []).map((item: any) => ({
      ...item,
      id: parseInt(item.id, 10),
    })) as RequirementDetail[];
  } catch (error) {
    console.error("Failed to parse JSON from extraction:", jsonString);
    throw new Error("API вернул неверный формат JSON при извлечении.");
  }
};


export const verifyRequirements = async (
  verificationFile: File,
  requirements: RequirementDetail[]
): Promise<ComplianceResult[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }
  const dataUrl = await fileToDataUrl(verificationFile);
  const isImage = (verificationFile.type || '').startsWith('image/');
  const requirementsJson = JSON.stringify(requirements);

  const textPrompt = `
    You are a meticulous compliance verification expert. Your task is to analyze a technical documentation file against a provided list of requirements.

    INSTRUCTIONS:
    For EACH requirement in the provided JSON data:
    1.  Find the corresponding 'parameter' in the technical documentation file.
    2.  Extract the 'actualValue' for that parameter from the document.
    3.  Compare the required value ('requirement') with the found 'actualValue'.
    4.  Determine the compliance 'status'. It must be one of these exact Russian strings: "Соответствует", "Не соответствует", "Частичное соответствие", "Не найдено".
    5.  Write a concise 'explanation' in Russian. State what was found and where.
    6.  IMPORTANT: Extract the page number ('pageNumber') where the actual value was found in the document. If it's an image or page number is not applicable, return 0.
    7.  Return the completed data for all requirements using the provided tool.
  `;

  const response = await fetch('https://api.aitunnel.ru/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            isImage
              ? { type: 'image_url', image_url: { url: dataUrl } }
              : { type: 'file', file: { filename: verificationFile.name || 'document', file_data: dataUrl } },
            { type: 'text', text: `Here are the requirements to verify: ${requirementsJson}` }
          ]
        }
      ],
      tool_choice: {"type": "function", "function": {"name": "save_verification_results"}},
      tools: [{
        type: 'function',
        function: {
          name: 'save_verification_results',
          description: 'Saves the results of the compliance verification.',
          parameters: {
            type: 'object',
            properties: {
              verificationResults: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    parameter: { type: 'string' },
                    requirement: { type: 'string' },
                    source: { type: 'string' },
                    notes: { type: 'string' },
                    actualValue: { type: 'string' },
                    status: { type: 'string', enum: [
                      'Соответствует',
                      'Не соответствует',
                      'Частичное соответствие',
                      'Не найдено'
                    ] },
                    explanation: { type: 'string' },
                    pageNumber: { type: 'number', description: 'The page number where the information was found. 0 if not applicable.' },
                  },
                  required: ['id', 'parameter', 'requirement', 'source', 'notes', 'actualValue', 'status', 'explanation', 'pageNumber'],
                }
              }
            },
            required: ['verificationResults'],
          }
        }
      }]
    })
  });
  
  const data = await response.json();

  if (!response.ok || data.error) {
    console.error("API Error in verification:", response.status, JSON.stringify(data, null, 2));
    let userMessage = `Ошибка API: ${data.error?.message || response.statusText}`;
    if (data.error?.code === 400 && data.error?.message === "Provider returned error") {
      userMessage = "Ошибка обработки документа (400). Пожалуйста, попробуйте другой файл. Возможно, документ поврежден, имеет слишком сложную структуру или его контент был заблокирован системой безопасности провайдера AI.";
    }
    throw new Error(userMessage);
  }

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const jsonString = toolCall?.function?.arguments;

  if (!jsonString) {
      console.error("API response did not contain tool_calls:", JSON.stringify(data, null, 2));
      throw new Error("API не вернул ожидаемый результат в формате tool_calls. Возможно, модель не смогла обработать запрос. Проверьте консоль для деталей.");
  }

  try {
    const parsedJson = JSON.parse(jsonString);
    return (parsedJson.verificationResults || []).map((item: any) => ({
        ...item,
        id: parseInt(item.id, 10)
    })) as ComplianceResult[];
  } catch (error) {
    console.error("Failed to parse JSON from verification tool_calls:", jsonString);
    throw new Error("API вернул неверный формат JSON при верификации.");
  }
};