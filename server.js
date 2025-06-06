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
    console.log('🔄 Enviando consulta a Claude Project...');
    console.log('📝 Mensaje:', userMessage);
    console.log('🆔 Project ID:', process.env.CLAUDE_PROJECT_ID ? `${process.env.CLAUDE_PROJECT_ID.substring(0, 8)}...` : 'NO CONFIGURADO');
    
    if (!process.env.CLAUDE_PROJECT_ID) {
      console.error('❌ CLAUDE_PROJECT_ID no está configurado');
      return 'Error de configuración: Project ID no establecido.';
    }
    
    const requestData = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: userMessage
      }],
      project_id: process.env.CLAUDE_PROJECT_ID
    };
    
    const response = await anthropic.messages.create(requestData);
    const claudeResponse = response.content[0].text;
    
    console.log('✅ Respuesta recibida de Claude Project');
    console.log('📊 Longitud de respuesta:', claudeResponse.length);
    
    // Verificar si parece que Claude tiene acceso al reglamento
    const hasReglamentoKeywords = claudeResponse.toLowerCase().includes('reglamento') || 
                                 claudeResponse.toLowerCase().includes('convivencia') ||
                                 claudeResponse.toLowerCase().includes('armonie') ||
                                 claudeResponse.toLowerCase().includes('edificio');
    
    console.log('🔍 Parece tener acceso al reglamento:', hasReglamentoKeywords);
    
    return claudeResponse;
    
  } catch (error) {
    console.error('❌ Error detallado con Claude Project:');
    console.error('- Mensaje:', error.message);
    console.error('- Status:', error.status);
    console.error('- Type:', error.type);
    console.error('- Response:', error.response?.data);
    
    if (error.status === 404) {
      return 'Error: No se pudo encontrar el proyecto de Claude. Verifica el CLAUDE_PROJECT_ID.';
    } else if (error.status === 401) {
      return 'Error: API Key inválida o sin permisos para acceder al proyecto.';
    } else if (error.status === 403) {
      return 'Error: Sin permisos para acceder a este proyecto de Claude.';
    }
    
    return 'Disculpa, no puedo procesar tu consulta en este momento. Intenta más tarde.';
  }
}

// Webhook principal - Simple proxy entre WhatsApp y Claude Project
app.post('/webhook', async (req, res) => {
  try {
    console.log('📥 Webhook recibido:', JSON.stringify(req.body, null, 2));
    
    // Extraer datos básicos del mensaje
    const messageData = req.body?.data;
    if (!messageData?.key?.remoteJid || !messageData?.message?.conversation) {
      console.log('⚠️ Mensaje ignorado - formato inválido');
      return res.status(200).json({ status: 'ignored' });
    }
    
    const senderNumber = messageData.key.remoteJid.replace('@s.whatsapp.net', '');
    const userMessage = messageData.message.conversation;
    
    // Ignorar mensajes vacíos
    if (!userMessage?.trim()) {
      console.log('⚠️ Mensaje ignorado - vacío');
      return res.status(200).json({ status: 'ignored' });
    }
    
    console.log(`📨 ${senderNumber}: ${userMessage}`);
    
    // PROXY SIMPLE: Enviar a Claude Project y recibir respuesta
    const claudeResponse = await sendToClaudeProject(userMessage);
    console.log(`🤖 Respuesta generada: ${claudeResponse.substring(0, 100)}...`);
    
    // PROXY SIMPLE: Enviar respuesta de vuelta por WhatsApp
    await sendWhatsAppMessage(senderNumber, claudeResponse);
    
    console.log(`✅ Consulta procesada para ${senderNumber}`);
    res.status(200).json({ status: 'success' });
    
  } catch (error) {
    console.error('❌ Error en proxy:', error);
    res.status(500).json({ status: 'error', message: error.message });
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
    claude_project_id_value: process.env.CLAUDE_PROJECT_ID ? `${process.env.CLAUDE_PROJECT_ID.substring(0, 8)}...` : 'NOT SET',
    evolution_api: EVOLUTION_CONFIG.baseURL,
    instance: EVOLUTION_CONFIG.instance
  });
});

// Endpoint para verificar que Claude Project funciona correctamente
app.get('/test-claude', async (req, res) => {
  try {
    console.log('🧪 Probando conexión con Claude Project...');
    
    if (!process.env.CLAUDE_PROJECT_ID) {
      return res.status(400).json({ 
        error: 'CLAUDE_PROJECT_ID no configurado',
        status: 'failed'
      });
    }
    
    // Mensaje de prueba específico para verificar acceso al reglamento
    const testMessage = "¿Qué información contiene el reglamento de convivencia? Dame un resumen breve de los temas que cubre.";
    
    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: testMessage
      }],
      project_id: process.env.CLAUDE_PROJECT_ID
    });
    
    const claudeResponse = response.content[0].text;
    
    // Verificar si la respuesta parece tener acceso al reglamento
    const hasReglamentoAccess = claudeResponse.toLowerCase().includes('reglamento') || 
                               claudeResponse.toLowerCase().includes('convivencia') ||
                               claudeResponse.toLowerCase().includes('edificio') ||
                               claudeResponse.toLowerCase().includes('normas');
    
    res.status(200).json({
      status: 'success',
      project_id: process.env.CLAUDE_PROJECT_ID,
      test_message: testMessage,
      claude_response: claudeResponse,
      seems_to_have_access: hasReglamentoAccess,
      response_length: claudeResponse.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error probando Claude Project:', error);
    res.status(500).json({
      status: 'failed',
      error: error.message,
      error_type: error.constructor.name,
      status_code: error.status || 'unknown'
    });
  }
});

// Endpoint para probar una consulta específica del reglamento
app.post('/test-query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Se requiere el parámetro query' });
    }
    
    console.log(`🧪 Probando consulta: ${query}`);
    
    const response = await sendToClaudeProject(query);
    
    res.status(200).json({
      status: 'success',
      query: query,
      response: response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'failed',
      error: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Proxy Server corriendo en puerto ${PORT}`);
  console.log(`📱 WhatsApp ↔️ Claude Project Proxy listo`);
});

// Cierre graceful
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
