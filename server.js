const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Configuración Evolution API
const EVOLUTION_CONFIG = {
  baseURL: 'https://evolution-api.jorgearone.xyz',
  apiKey: '429683C4C977415CAAFCCE10F7D57E11',
  instanceName: 'hongo'
};

// Configuración Claude
const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Función para enviar mensaje via Evolution API
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      `${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instanceName}`,
      {
        number: to,
        text: message
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_CONFIG.apiKey
        }
      }
    );
    
    console.log('Mensaje enviado exitosamente:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error enviando mensaje:', error.response?.data || error.message);
    throw error;
  }
}

// Función para consultar Claude
async function consultarClaude(pregunta, numeroTelefono) {
  try {
    const response = await claude.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Como asistente del edificio, responde esta consulta sobre el manual de convivencia de manera amable y clara. Si no tienes información específica en el manual, indica que pueden contactar a la administración.

Consulta: ${pregunta}

Por favor responde de forma concisa y útil para un vecino del edificio.`
        }
      ],
      // Aquí irá el PROJECT_ID una vez que creemos el proyecto Claude
      // project: process.env.CLAUDE_PROJECT_ID
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error consultando Claude:', error);
    return 'Lo siento, hay un problema técnico. Por favor contacta a la administración del edificio.';
  }
}

// Webhook para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook recibido:', JSON.stringify(req.body, null, 2));

    const { data } = req.body;
    
    // Verificar que es un mensaje de texto entrante
    if (data && (data.messageType === 'conversation' || data.messageType === 'textMessage') && !data.key.fromMe) {
      const numeroTelefono = data.key.remoteJid;
      const mensaje = data.message.conversation || data.message.extendedTextMessage?.text;
      
      if (mensaje) {
        console.log(`Mensaje recibido de ${numeroTelefono}: ${mensaje}`);
        
        // Consultar Claude
        const respuesta = await consultarClaude(mensaje, numeroTelefono);
        
        // Enviar respuesta via WhatsApp
        await sendWhatsAppMessage(numeroTelefono, respuesta);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error procesando mensaje' });
  }
});

// Endpoint de prueba
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Chatbot funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para enviar mensaje de prueba
app.post('/test-message', async (req, res) => {
  try {
    const { number, message } = req.body;
    const result = await sendWhatsAppMessage(number, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`📱 Evolution API: ${EVOLUTION_CONFIG.baseURL}`);
  console.log(`🤖 Instancia WhatsApp: ${EVOLUTION_CONFIG.instanceName}`);
});

module.exports = app;
