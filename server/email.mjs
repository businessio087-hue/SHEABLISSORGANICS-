import nodemailer from 'nodemailer';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const money = (amountCents, currency = 'ZAR') => {
  const amount = (Number(amountCents) / 100).toLocaleString('en-ZA', { style: 'currency', currency });
  return amount.replace(/\u00a0/g, ' ');
};

const getTransport = () => {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !pass) throw new Error('Gmail SMTP is not configured for Production.');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
};

const orderParts = ({ orderId, referenceNumber, amountCents, currency, items }) => {
  const safeOrderId = escapeHtml(orderId);
  const safeReferenceNumber = escapeHtml(referenceNumber || orderId);
  const safeCurrency = escapeHtml(currency);
  const itemRows = (Array.isArray(items) ? items : []).map((item) => {
    const lineTotal = Number(item.amountCents) * Number(item.quantity);
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #eadfce">${escapeHtml(item.name || item.product)} — ${escapeHtml(item.size)} × ${escapeHtml(item.quantity)}</td><td style="padding:8px 0;border-bottom:1px solid #eadfce;text-align:right">${escapeHtml(money(lineTotal, currency))}</td></tr>`;
  }).join('');
  const textItems = (Array.isArray(items) ? items : []).map((item) => `- ${item.name || item.product} — ${item.size} × ${item.quantity}: ${money(Number(item.amountCents) * Number(item.quantity), currency)}`).join('\n');
  return { safeOrderId, safeReferenceNumber, safeCurrency, itemRows, textItems, total: money(amountCents, currency) };
};

export const sendOrderConfirmation = async ({ orderId, referenceNumber, customerName, customerEmail, amountCents, currency, items }) => {
  const transport = getTransport();
  const safeName = escapeHtml(customerName);
  const { safeOrderId, safeReferenceNumber, safeCurrency, itemRows, textItems, total } = orderParts({ orderId, referenceNumber, amountCents, currency, items });
  await transport.sendMail({
    from: `SHEABLISS ORGANICS <${process.env.GMAIL_SMTP_USER}>`,
    to: customerEmail,
    subject: `Your SHEABLISS ORGANICS order ${orderId}`,
    text: `Hello ${customerName},\n\nThank you for choosing SHEABLISS ORGANICS. We have received your payment and are preparing your ritual.\n\nOrder number: ${orderId}\nReference: ${referenceNumber || orderId}\nTotal: ${total}\n\n${textItems}\n\nWe will share shipping updates as your order moves toward you.\n\nWith care,\nSHEABLISS ORGANICS`,
    html: `<div style="background:#f6efe3;padding:32px 16px;font-family:Arial,sans-serif;color:#3b2419"><div style="max-width:560px;margin:0 auto;background:#fffaf3;padding:32px;border:1px solid #eadfce"><p style="letter-spacing:.16em;text-transform:uppercase;font-size:11px;color:#9b4b32">SHEABLISS ORGANICS</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:400;margin:24px 0 12px">Hello ${safeName},</h1><p>Thank you for choosing SHEABLISS ORGANICS. We have received your payment and are preparing your ritual.</p><table style="width:100%;border-collapse:collapse;margin:24px 0"><tbody>${itemRows}</tbody><tfoot><tr><td style="padding-top:16px;font-weight:bold">Total</td><td style="padding-top:16px;text-align:right;font-weight:bold">${escapeHtml(total)}</td></tr></tfoot></table><p style="font-size:13px;color:#765f50">Order number: <strong>${safeOrderId}</strong><br>Reference: <strong>${safeReferenceNumber}</strong><br>Currency: ${safeCurrency}</p><p>We will share shipping updates as your order moves toward you.</p><p style="margin-top:28px">With care,<br><strong>SHEABLISS ORGANICS</strong></p></div></div>`,
  });
};

export const sendOwnerOrderNotification = async ({ orderId, referenceNumber, customerName, customerEmail, customerPhone, deliveryAddress, amountCents, currency, items }) => {
  const transport = getTransport();
  const inbox = process.env.GMAIL_SMTP_USER;
  const { safeOrderId, safeReferenceNumber, itemRows, textItems, total } = orderParts({ orderId, referenceNumber, amountCents, currency, items });
  const safeName = escapeHtml(customerName);
  const safeEmail = escapeHtml(customerEmail);
  const safePhone = escapeHtml(customerPhone);
  const safeAddress = escapeHtml(deliveryAddress);
  await transport.sendMail({
    from: `SHEABLISS ORGANICS <${inbox}>`,
    to: inbox,
    subject: `New paid order ${orderId} · ${customerName}`,
    text: `New SHEABLISS ORGANICS order received.\n\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone}\nDelivery address:\n${deliveryAddress}\n\nOrder number: ${orderId}\nReference: ${referenceNumber || orderId}\nTotal: ${total}\n\n${textItems}\n\nPayment was verified by the Yoco webhook.`,
    html: `<div style="background:#f6efe3;padding:32px 16px;font-family:Arial,sans-serif;color:#3b2419"><div style="max-width:600px;margin:0 auto;background:#fffaf3;padding:32px;border:1px solid #eadfce"><p style="letter-spacing:.16em;text-transform:uppercase;font-size:11px;color:#9b4b32">SHEABLISS ORGANICS / NEW ORDER</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:400;margin:24px 0 12px">A paid order is ready.</h1><p><strong>Customer:</strong> ${safeName}<br><strong>Email:</strong> ${safeEmail}<br><strong>Phone:</strong> ${safePhone}<br><strong>Delivery address:</strong><br>${safeAddress}</p><p style="font-size:13px;color:#765f50"><strong>Order number:</strong> ${safeOrderId}<br><strong>Reference:</strong> ${safeReferenceNumber}</p><table style="width:100%;border-collapse:collapse;margin:24px 0"><tbody>${itemRows}</tbody><tfoot><tr><td style="padding-top:16px;font-weight:bold">Total</td><td style="padding-top:16px;text-align:right;font-weight:bold">${escapeHtml(total)}</td></tr></tfoot></table><p>Payment was verified by the Yoco webhook.</p></div></div>`,
  });
};
