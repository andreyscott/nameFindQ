const { GoogleGenAI } = require('@google/genai');

async function test() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    console.log('Calling Gemini...');
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    const response = await result.response;
    console.log('Response received:', response.text());
  } catch (error) {
    console.error('Error caught:');
    console.error(JSON.stringify(error, null, 2));
    console.error('Error message:', error.message);
    console.error('Error status:', error.status);
  }
}

test();
