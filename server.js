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

// Configuración Claude CORREGIDA
const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// Función para limpiar número de teléfono
function cleanPhoneNumber(number) {
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

// Función para consultar Claude MEJORADA
async function consultarClaude(pregunta, numeroTelefono) {
  try {
    if (!process.env.CLAUDE_API_KEY) {
      console.error('❌ CLAUDE_API_KEY no está configurada');
      return 'Lo siento, hay un problema de configuración. Por favor contacta a la administración del edificio.';
    }

    console.log('🤖 Consultando Claude para:', pregunta.substring(0, 50) + '...');

    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20240620', // Modelo actualizado
      max_tokens: 500, // Aumentado para respuestas más completas
      messages: [
        {
          role: 'user',
          content: `Eres el asistente virtual del EDIFICIO ARMONIE. Tu único propósito es ayudar con consultas sobre el manual de convivencia.

REGLAS ESTRICTAS:
- SOLO responde sobre temas del manual de convivencia del edificio Armonie
- Si la pregunta NO está relacionada con el manual o el edificio, responde: "Solo puedo ayudarte con consultas sobre el manual de convivencia del edificio Armonie. Para otras consultas, contacta a la administración."
- Usa información específica del manual adjunto en este proyecto
- Si no tienes la información específica, di: "No encuentro esa información específica en el manual. Te sugiero contactar a la administración del edificio."
- Mantén respuestas claras y útiles (máximo 4 líneas para WhatsApp)
- Usa un tono amable y profesional
- Si mencionas horarios, reglas o procedimientos, sé específico

PREGUNTA DEL VECINO: ${pregunta}

RESPUESTA (basada en el manual de convivencia del Edificio Armonie):`
        }
      ],
      // Configuración correcta para Claude Projects
      ...(process.env.CLAUDE_PROJECT_ID && {
        system: "Usa la base de conocimiento del manual de convivencia adjunto en este proyecto para responder las consultas de los vecinos del Edificio Armonie."
      })
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
    } else if (error.status === 400) {
      return 'Error en la consulta. Por favor reformula tu pregunta o contacta a la administración.';
    } else {
      return 'Lo siento, hay un problema técnico temporal. Por favor contacta a la administración del edificio o intenta nuevamente más tarde.';
    }
  }
}

// Función para validar mensaje entrante MEJORADA
function esMensajeValido(data) {
  if (!data || !data.key || data.key.fromMe) return false;
  
  const tiposValidos = ['conversation', 'textMessage', 'extendedTextMessage'];
  const tieneTexto = data.message && 
                   (data.message.conversation || 
                    data.message.textMessage?.text || 
                    data.message.extendedTextMessage?.text);
  
  return tiposValidos.includes(data.messageType) && tieneTexto;
}

// Función para extraer texto del mensaje
function extraerTextoMensaje(data) {
  if (data.message.conversation) {
    return data.message.conversation;
  } else if (data.message.textMessage?.text) {
    return data.message.textMessage.text;
  } else if (data.message.extendedTextMessage?.text) {
    return data.message.extendedTextMessage.text;
  }
  return '';
}

// Webhook para recibir mensajes de WhatsApp MEJORADO
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Webhook recibido en:', new Date().toISOString());
    
    // Log simplificado para producción
    if (process.env.NODE_ENV === 'development') {
      console.log('📋 Datos del webhook:', JSON.stringify(req.body, null, 2));
    }

    const { data } = req.body;
    
    if (!esMensajeValido(data)) {
      console.log('⏭️ Mensaje ignorado (no es texto entrante válido)');
      return res.status(200).json({ success: true, message: 'Mensaje ignorado' });
    }

    const numeroTelefono = data.key.remoteJid;
    const mensaje = extraerTextoMensaje(data);
    const nombreUsuario = data.pushName || 'Usuario';
    
    console.log(`📞 Mensaje de ${nombreUsuario} (${numeroTelefono.substring(0, 10)}...): ${mensaje.substring(0, 50)}...`);
    
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
      claudeConfigured: !!process.env.CLAUDE_API_KEY,
      claudeProjectConfigured: !!process.env.CLAUDE_PROJECT_ID
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
      hasProjectId: !!process.env.CLAUDE_PROJECT_ID,
      model: 'claude-3-5-sonnet-20241022'
    },
    server: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});

// Endpoint de prueba GET para Claude
app.get('/test-claude-simple', async (req, res) => {
  try {
    const testMessage = req.query.message || '¿Cuáles son los horarios de silencio en el edificio?';
    console.log('🧪 Probando Claude con mensaje:', testMessage);
    
    const respuesta = await consultarClaude(testMessage, 'test');
    res.json({ 
      success: true, 
      pregunta: testMessage,
      respuesta,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🧪 Error en prueba:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
  console.log(`🚀 Chatbot Armonie - Manual de Convivencia`);
  console.log(`🚀 Puerto: ${PORT}`);
  console.log(`🚀 Timestamp: ${new Date().toISOString()}`);
  console.log('🚀 ================================');
  console.log(`📱 Evolution API: ${EVOLUTION_CONFIG.baseURL}`);
  console.log(`🤖 Instancia WhatsApp: ${EVOLUTION_CONFIG.instanceName}`);
  console.log(`🔑 Claude API: ${!!process.env.CLAUDE_API_KEY ? '✅ Configurada' : '❌ Falta configurar'}`);
  console.log(`📋 Claude Project: ${!!process.env.CLAUDE_PROJECT_ID ? '✅ Configurado' : '❌ Falta configurar'}`);
  console.log('🚀 ================================');
  console.log('✅ Chatbot listo para recibir mensajes');
  console.log('🔗 Endpoints disponibles:');
  console.log(`   GET  /health - Estado del sistema`);
  console.log(`   GET  /config - Configuración actual`);
  console.log(`   GET  /test-claude-simple?message=tu_pregunta - Probar Claude rápido`);
  console.log(`   POST /webhook - Webhook de WhatsApp`);
  console.log(`   POST /test-claude - Probar Claude`);
  console.log(`   POST /test-whatsapp - Probar WhatsApp`);
  console.log('🚀 ================================');
});

module.exports = app;
