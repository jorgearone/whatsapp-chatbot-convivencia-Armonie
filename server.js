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
  instanceName: 'Hongo'
};

// Configuración Claude
const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Función para limpiar número de teléfono
function cleanPhoneNumber(number) {
  // Remover @s.whatsapp.net si existe
  return number.replace('@s.whatsapp.net', '');
}

// Función para enviar mensaje via Evolution API
async function sendWhatsAppMessage(to, message) {
  try {
    const cleanNumber = cleanPhoneNumber(to);
    
    const response = await axios.post(
      `${EVOLUTION_CONFIG.baseURL}/message/sendText/${EVOLUTION_CONFIG.instanceName}`,
      {
        number: cleanNumber,
        text: message
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_CONFIG.apiKey
        }
      }
    );
    
    console.log('✅ Mensaje enviado exitosamente a:', cleanNumber);
    return response.data;
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
    throw error;
  }
}

// Función para consultar Claude
async function consultarClaude(pregunta, numeroTelefono) {
  try {
    // Verificar que tenemos API key
    if (!process.env.CLAUDE_API_KEY) {
      console.error('❌ CLAUDE_API_KEY no está configurada');
      return 'Lo siento, hay un problema de configuración. Por favor contacta a la administración del edificio.';
    }

    console.log('🤖 Consultando Claude para:', pregunta.substring(0, 50) + '...');

    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Modelo más estable
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Eres un asistente virtual del edificio Armonie. Tu trabajo es responder preguntas sobre el manual de convivencia y normas del edificio de manera amable, clara y concisa.

INSTRUCCIONES:
- Responde siempre en español
- Sé amable y profesional
- Si no tienes información específica sobre algo, indica que pueden contactar a la administración
- Mantén las respuestas concisas pero útiles
- Si la pregunta no está relacionada con el edificio, redirige amablemente hacia temas del edificio

CONSULTA DEL VECINO: ${pregunta}

Responde de manera útil y amigable:`
        }
      ]
    });

    const respuesta = response.content[0].text;
    console.log('✅ Respuesta de Claude generada exitosamente');
    return respuesta;

  } catch (error) {
    console.error('❌ Error consultando Claude:', error.message);
    
    if (error.status === 401) {
      return 'Lo siento, hay un problema de autenticación con el sistema. Por favor contacta a la administración del edificio.';
    } else if (error.status === 429) {
      return 'El sistema está temporalmente sobrecargado. Por favor intenta nuevamente en unos minutos.';
    } else {
      return 'Lo siento, hay un problema técnico temporal. Por favor contacta a la administración del edificio o intenta nuevamente más tarde.';
    }
  }
}

// Función para validar mensaje entrante
function esMensajeValido(data) {
  return data && 
         (data.messageType === 'conversation' || data.messageType === 'textMessage') && 
         !data.key.fromMe && 
         data.message && 
         (data.message.conversation || data.message.extendedTextMessage?.text);
}

// Webhook para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Webhook recibido en:', new Date().toISOString());
    console.log('📋 Datos del webhook:', JSON.stringify(req.body, null, 2));

    const { data } = req.body;
    
    // Verificar que es un mensaje válido
    if (!esMensajeValido(data)) {
      console.log('⏭️ Mensaje ignorado (no es texto entrante)');
      return res.status(200).json({ success: true, message: 'Mensaje ignorado' });
    }

    const numeroTelefono = data.key.remoteJid;
    const mensaje = data.message.conversation || data.message.extendedTextMessage?.text;
    const nombreUsuario = data.pushName || 'Usuario';
    
    console.log(`📞 Mensaje de ${nombreUsuario} (${numeroTelefono}): ${mensaje}`);
    
    // Consultar Claude
    const respuesta = await consultarClaude(mensaje, numeroTelefono);
    
    // Enviar respuesta via WhatsApp
    await sendWhatsAppMessage(numeroTelefono, respuesta);
    
    console.log('✅ Procesamiento completado exitosamente');
    res.status(200).json({ 
      success: true, 
      message: 'Mensaje procesado correctamente',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Error en webhook:', error.message);
    res.status(500).json({ 
      error: 'Error procesando mensaje',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint de salud/prueba
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Chatbot Armonie funcionando correctamente',
    timestamp: new Date().toISOString(),
    config: {
      evolutionAPI: EVOLUTION_CONFIG.baseURL,
      instance: EVOLUTION_CONFIG.instanceName,
      claudeConfigured: !!process.env.CLAUDE_API_KEY
    }
  });
});

// Endpoint para probar Claude
app.post('/test-claude', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }
    
    const respuesta = await consultarClaude(message, 'test');
    res.json({ 
      success: true, 
      respuesta,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para enviar mensaje de prueba
app.post('/test-whatsapp', async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number || !message) {
      return res.status(400).json({ error: 'Número y mensaje son requeridos' });
    }
    
    const result = await sendWhatsAppMessage(number, message);
    res.json({ 
      success: true, 
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para verificar configuración
app.get('/config', (req, res) => {
  res.json({
    evolutionAPI: {
      baseURL: EVOLUTION_CONFIG.baseURL,
      instance: EVOLUTION_CONFIG.instanceName,
      hasApiKey: !!EVOLUTION_CONFIG.apiKey
    },
    claude: {
      hasApiKey: !!process.env.CLAUDE_API_KEY,
      hasProjectId: !!process.env.CLAUDE_PROJECT_ID
    },
    server: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('💥 Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🚀 ================================');
  console.log(`🚀 Servidor Chatbot Armonie iniciado`);
  console.log(`🚀 Puerto: ${PORT}`);
  console.log(`🚀 Timestamp: ${new Date().toISOString()}`);
  console.log('🚀 ================================');
  console.log(`📱 Evolution API: ${EVOLUTION_CONFIG.baseURL}`);
  console.log(`🤖 Instancia WhatsApp: ${EVOLUTION_CONFIG.instanceName}`);
  console.log(`🔑 Claude API configurada: ${!!process.env.CLAUDE_API_KEY ? 'SÍ' : 'NO'}`);
  console.log('🚀 ================================');
  console.log('✅ Chatbot listo para recibir mensajes');
  console.log('🔗 Endpoints disponibles:');
  console.log(`   GET  /health - Estado del sistema`);
  console.log(`   GET  /config - Configuración actual`);
  console.log(`   POST /webhook - Webhook de WhatsApp`);
  console.log(`   POST /test-claude - Probar Claude`);
  console.log(`   POST /test-whatsapp - Probar WhatsApp`);
  console.log('🚀 ================================');
});

module.exports = app;

// Endpoint temporal para probar Claude desde navegador
app.get('/test-claude-get', async (req, res) => {
  try {
    console.log('🧪 Probando Claude desde navegador...');
    const respuesta = await consultarClaude('Hola, ¿cómo estás?', 'test');
    res.json({ 
      success: true, 
      respuesta,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🧪 Error en prueba:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});
