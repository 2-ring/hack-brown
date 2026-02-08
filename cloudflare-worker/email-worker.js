import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    const from = message.from;
    const to = message.to;
    const subject = message.headers.get('subject') || '';

    try {
      // Read the raw email into an ArrayBuffer
      const rawEmail = await new Response(message.raw).arrayBuffer();

      // Parse MIME structure
      const parser = new PostalMime();
      const parsed = await parser.parse(rawEmail);

      // Extract bodies
      const textBody = parsed.text || '';
      const htmlBody = parsed.html || '';

      // Extract attachments as base64
      const attachments = (parsed.attachments || []).map((att) => ({
        filename: att.filename || 'unnamed',
        content_type: att.mimeType || 'application/octet-stream',
        content_base64: arrayBufferToBase64(att.content),
      }));

      // POST to backend webhook
      const response = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': env.WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          text_body: textBody,
          html_body: htmlBody,
          attachments,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error(
          `Webhook failed: ${response.status} ${response.statusText}`
        );
        // Forward to fallback if configured
        if (env.FALLBACK_ADDRESS) {
          await message.forward(env.FALLBACK_ADDRESS);
        }
      }
    } catch (err) {
      console.error('Email processing error:', err);
      if (env.FALLBACK_ADDRESS) {
        await message.forward(env.FALLBACK_ADDRESS);
      }
    }
  },
};

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
