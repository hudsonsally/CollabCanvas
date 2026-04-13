import { GoogleGenAI, Type } from "@google/genai";
import { Shape, ShapeType } from '../types';

// The API key is injected via vite.config.ts define
const apiKey = process.env.API_KEY;

let ai: GoogleGenAI;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey: apiKey });
} else {
  console.warn("Gemini API Key is missing. AI features will not work.");
}

export const generateShapesFromPrompt = async (prompt: string): Promise<Partial<Shape>[]> => {
  if (!ai) throw new Error("API Key missing");

  const modelId = 'gemini-2.5-flash'; 
  
  const systemInstruction = `
    You are a vector graphics assistant. 
    Your task is to convert user requests into a list of geometric shapes (rectangles, circles, lines, text) that form a drawing.
    The canvas size is roughly 800x600.
    Return a JSON array of shapes.
    
    Coordinate system: (0,0) is top-left.
    
    For 'rectangle': required fields: type='rectangle', x, y, width, height, fill, stroke.
    For 'circle': required fields: type='circle', x, y, radius, fill, stroke.
    For 'text': required fields: type='text', x, y, text, fill (for text color), fontSize.
  `;

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ['rectangle', 'circle', 'text'] },
        x: { type: Type.NUMBER },
        y: { type: Type.NUMBER },
        width: { type: Type.NUMBER },
        height: { type: Type.NUMBER },
        radius: { type: Type.NUMBER },
        text: { type: Type.STRING },
        fill: { type: Type.STRING },
        stroke: { type: Type.STRING },
      },
      required: ['type', 'x', 'y', 'fill'],
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.4, // Lower temp for more precise drawings
      }
    });

    if (response.text) {
      let text = response.text;
      // Strip markdown code blocks if present
      if (text.startsWith("```")) {
        text = text.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
      }
      const data = JSON.parse(text);
      return data as Partial<Shape>[];
    }
    return [];
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export const explainDrawing = async (shapes: Shape[]): Promise<string> => {
    if (!ai) return "AI not configured.";
    
    const shapesDescription = JSON.stringify(shapes.map(s => ({ type: s.type, x: s.x, y: s.y, color: s.fill })));

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Here is a list of shapes on a canvas: ${shapesDescription}. Describe what this likely represents in one short sentence.`,
        });
        return response.text || "Could not analyze.";
    } catch (e) {
        return "Error analyzing drawing.";
    }
}