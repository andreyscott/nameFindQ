const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: 'AIzaSyDnOvvwaWaoFAHT2Q7JwwOI6zgT1JHVLRQ' });

async function list() {
  try {
    const res = await ai.models.list();
    console.log('Keys:', Object.keys(res));
    if (res.models) console.log('Models is array:', Array.isArray(res.models));
  } catch (err) {
    console.error('List failed:', err.message);
  }
}

list();
