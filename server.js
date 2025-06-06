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
app.use(express.urlencoded({ extended: true }));

// Inicializar cliente de Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Configuración de Evolution API
const EVOLUTION_CONFIG = {
  baseURL: 'https://evolution-api.jorgearone.xyz',
  instance: 'Hongo',
  apiKey: '429683C4C977415CAAFCCE10F7D57E11'
};

// Función simple para enviar mensajes por WhatsApp
async function sendWhatsAppMessage(number, message) {
  try {
    await axios.post(
      `${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instance}`,
      {
        number: number,
        text: message
      },
      {
        headers: {
          'apikey': EVOLUTION_CONFIG.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Mensaje enviado a ${number}`);
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
    throw error;
  }
}

// Función simple para enviar consulta a Claude Project
async function sendToClaudeProject(userMessage) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: userMessage
      }],
      // Usar el Project ID para acceder a la base de conocimiento automáticamente
      project_id: process.env.CLAUDE_PROJECT_ID
    });
    
    return response.content[0].text;
  } catch (error) {
    console.error('❌ Error con Claude Project:', error);
    return 'Disculpa, no puedo procesar tu consulta en este momento. Intenta más tarde.';
  }
}

// Webhook principal - Simple proxy entre WhatsApp y Claude Project
app.post('/webhook', async (req, res) => {
  try {
    // Extraer datos básicos del mensaje
    const messageData = req.body?.data;
    if (!messageData?.key?.remoteJid || !messageData?.message?.conversation) {
      return res.status(200).json({ status: 'ignored' });
    }
    
    const senderNumber = messageData.key.remoteJid.replace('@s.whatsapp.net', '');
    const userMessage = messageData.message.conversation;
    
    // Ignorar mensajes vacíos
    if (!userMessage?.trim()) {
      return res.status(200).json({ status: 'ignored' });
    }
    
    console.log(`📨 ${senderNumber}: ${userMessage}`);
    
    // PROXY SIMPLE: Enviar a Claude Project y recibir respuesta
    const claudeResponse = await sendToClaudeProject(userMessage);
    
    // PROXY SIMPLE: Enviar respuesta de vuelta por WhatsApp
    await sendWhatsAppMessage(senderNumber, claudeResponse);
    
    console.log(`✅ Consulta procesada para ${senderNumber}`);
    res.status(200).json({ status: 'success' });
    
  } catch (error) {
    console.error('❌ Error en proxy:', error);
    res.status(500).json({ status: 'error' });
  }
});

// Endpoint de salud básico
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    service: 'WhatsApp-Claude Proxy',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para verificar conexiones
app.get('/status', (req, res) => {
  res.status(200).json({
    claude_api: !!process.env.CLAUDE_API_KEY,
    claude_project: !!process.env.CLAUDE_PROJECT_ID,
    evolution_api: EVOLUTION_CONFIG.baseURL,
    instance: EVOLUTION_CONFIG.instance
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Proxy Server corriendo en puerto ${PORT}`);
  console.log(`📱 WhatsApp ↔️ Claude Project Proxy listo`);
});

// Cierre graceful
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
