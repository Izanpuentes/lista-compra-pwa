// email.service.ts
// Servicio centralizado para el envío de correos transaccionales usando la
// API HTTP de Brevo (antes Sendinblue). Se usa la API en vez de SMTP porque
// Render bloquea los puertos SMTP (25, 465, 587) en los servicios gratuitos,
// mientras que las peticiones HTTPS (como esta) nunca se bloquean.
//
// Variables de entorno necesarias (configúralas en Render → Environment):
//   BREVO_API_KEY      -> la API Key que genera Brevo (empieza por "xkeysib-")
//   BREVO_SENDER_EMAIL  -> el email que verificaste como "remitente único" en Brevo
//   BREVO_SENDER_NAME   -> (opcional) nombre que verá el destinatario como remitente
 
interface EnviarEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
 
export async function enviarEmail({ to, subject, html, text }: EnviarEmailParams) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'Lista de la Compra';
 
  if (!apiKey || !senderEmail) {
    throw new Error('Faltan las variables de entorno BREVO_API_KEY o BREVO_SENDER_EMAIL.');
  }
 
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(text ? { textContent: text } : {}),
    }),
  });
 
  if (!respuesta.ok) {
    const cuerpoError = await respuesta.text();
    throw new Error(`Brevo respondió con un error (${respuesta.status}): ${cuerpoError}`);
  }
 
  return respuesta.json();
}
 