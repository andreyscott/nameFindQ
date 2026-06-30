const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: 'test' });
console.log('AI keys:', Object.keys(ai));
if (ai.models) {
  console.log('AI.models keys:', Object.keys(ai.models));
}
