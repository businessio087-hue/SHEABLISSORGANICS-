import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { findVariant } from '../shared/catalog.mjs';
import { sendOrderConfirmation, sendOwnerOrderNotification } from './email.mjs';

let pool;
let schemaReady;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const getPool = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not available.');
  pool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 60000,
  });
  return pool;
};

const ensureSchema = async () => {
  schemaReady ??= (async () => {
    const db = getPool();
    await db.query(`
    CREATE TABLE IF NOT EXISTS yoco_orders (
      order_id VARCHAR(64) NOT NULL PRIMARY KEY,
      reference_number VARCHAR(64) NULL UNIQUE,
      checkout_id VARCHAR(128) NULL UNIQUE,
      payment_id VARCHAR(128) NULL,
      provider_event_id VARCHAR(128) NULL,
      status VARCHAR(32) NOT NULL,
      amount_cents INT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'ZAR',
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(320) NOT NULL,
      customer_phone VARCHAR(40) NULL,
      delivery_address TEXT NOT NULL,
      items_json JSON NOT NULL,
      provider_mode VARCHAR(16) NULL,
      confirmation_status VARCHAR(16) NOT NULL DEFAULT 'pending',
      confirmation_sent_at TIMESTAMP NULL,
      owner_notification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
      owner_notification_sent_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_yoco_orders_status (status),
      INDEX idx_yoco_orders_payment_id (payment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
    for (const statement of [
      `ALTER TABLE yoco_orders ADD COLUMN reference_number VARCHAR(64) NULL UNIQUE`,
      `ALTER TABLE yoco_orders ADD COLUMN confirmation_status VARCHAR(16) NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE yoco_orders ADD COLUMN confirmation_sent_at TIMESTAMP NULL`,
      `ALTER TABLE yoco_orders ADD COLUMN owner_notification_status VARCHAR(16) NOT NULL DEFAULT 'pending'`,
      `ALTER TABLE yoco_orders ADD COLUMN owner_notification_sent_at TIMESTAMP NULL`,
      `ALTER TABLE yoco_orders ADD COLUMN customer_phone VARCHAR(40) NULL`,
    ]) {
      try { await db.query(statement); } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
    await db.query(`
      CREATE TABLE IF NOT EXISTS yoco_webhook_events (
        event_id VARCHAR(128) NOT NULL PRIMARY KEY,
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return true;
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
};

const readBody = (req, maxBytes = 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(new Error('Request body is too large.'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const originFor = (req) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers.host || '').split(',')[0].trim();
  if (!host) return null;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`.replace(/\/$/, '');
};

const clean = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);

const validateInput = (body) => {
  const customer = body?.customer || {};
  const name = clean(customer.name, 255);
  const email = clean(customer.email, 320).toLowerCase();
  const phone = clean(customer.phone, 40);
  const streetAddress = clean(customer.streetAddress, 255);
  const suburb = clean(customer.suburb, 120);
  const postalCode = clean(customer.postalCode, 10);
  const buildingType = clean(customer.buildingType, 80);
  const companyName = clean(customer.companyName, 160);
  const address = [companyName, buildingType, streetAddress, `${suburb}, ${postalCode}`].filter(Boolean).join('\n');
  if (!name || !phone || !streetAddress || !suburb || !postalCode || !buildingType || !/^[0-9]{4}$/.test(postalCode) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[0-9()\-\s]{7,39}$/.test(phone)) {
    throw Object.assign(new Error('Please provide a valid name, email, phone number, and complete delivery address.'), { statusCode: 400 });
  }
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 20) {
    throw Object.assign(new Error('Choose at least one product before starting payment.'), { statusCode: 400 });
  }

  const items = body.items.map((item) => {
    const product = clean(item.product, 120);
    const size = clean(item.size, 32);
    const quantity = Number(item.quantity);
    const variant = findVariant(product, size);
    if (!variant || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw Object.assign(new Error('One or more selected product options are invalid.'), { statusCode: 400 });
    }
    return {
      product: variant.product,
      category: variant.category,
      size: variant.size,
      description: variant.description,
      amountZar: variant.amountZar,
      amountCents: variant.amountZar * 100,
      quantity,
    };
  });

  const amountCents = items.reduce((sum, item) => sum + item.amountCents * item.quantity, 0);
  if (amountCents < 200) {
    throw Object.assign(new Error('Yoco requires a minimum payment of R2.00.'), { statusCode: 400 });
  }
  return { name, email, phone, address, addressDetails: { streetAddress, suburb, postalCode, buildingType, companyName }, items, amountCents };
};

const newOrderId = () => `SB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const newReferenceNumber = () => `SBR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const sendConfirmationOnce = async (orderId) => {
  const db = getPool();
  const [claim] = await db.execute(
    `UPDATE yoco_orders
     SET confirmation_status = 'sending'
     WHERE order_id = ? AND status = 'paid' AND confirmation_status = 'pending' AND confirmation_sent_at IS NULL`,
    [orderId],
  );
  if (claim.affectedRows !== 1) return;
  try {
    const [rows] = await db.execute(
      `SELECT order_id, reference_number, customer_name, customer_email, customer_phone, amount_cents, currency, items_json
       FROM yoco_orders WHERE order_id = ? LIMIT 1`,
      [orderId],
    );
    const order = rows[0];
    if (!order) throw new Error(`Order ${orderId} was not found while sending confirmation.`);
    await sendOrderConfirmation({
      orderId: order.order_id,
      referenceNumber: order.reference_number,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      amountCents: order.amount_cents,
      currency: order.currency,
      items: typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json,
    });
    await db.execute(
      `UPDATE yoco_orders SET confirmation_status = 'sent', confirmation_sent_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
      [orderId],
    );
  } catch (error) {
    await db.execute(`UPDATE yoco_orders SET confirmation_status = 'failed' WHERE order_id = ?`, [orderId]);
    throw error;
  }
};

const sendOwnerNotificationOnce = async (orderId) => {
  const db = getPool();
  const [claim] = await db.execute(
    `UPDATE yoco_orders
     SET owner_notification_status = 'sending'
     WHERE order_id = ? AND status = 'paid' AND owner_notification_status = 'pending' AND owner_notification_sent_at IS NULL`,
    [orderId],
  );
  if (claim.affectedRows !== 1) return;
  try {
    const [rows] = await db.execute(
      `SELECT order_id, reference_number, customer_name, customer_email, customer_phone, delivery_address, amount_cents, currency, items_json
       FROM yoco_orders WHERE order_id = ? LIMIT 1`,
      [orderId],
    );
    const order = rows[0];
    if (!order) throw new Error(`Order ${orderId} was not found while sending the internal notification.`);
    await sendOwnerOrderNotification({
      orderId: order.order_id,
      referenceNumber: order.reference_number,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      deliveryAddress: order.delivery_address,
      amountCents: order.amount_cents,
      currency: order.currency,
      items: typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json,
    });
    await db.execute(
      `UPDATE yoco_orders SET owner_notification_status = 'sent', owner_notification_sent_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
      [orderId],
    );
  } catch (error) {
    await db.execute(`UPDATE yoco_orders SET owner_notification_status = 'failed' WHERE order_id = ?`, [orderId]);
    throw error;
  }
};

const createCheckout = async (req, res) => {
  if (!process.env.YOCO_SECRET_KEY) return json(res, 503, { error: 'Yoco checkout is not configured for this environment yet.' });
  const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  const input = validateInput(body);
  const origin = originFor(req);
  if (!origin) return json(res, 400, { error: 'The checkout origin could not be determined.' });

  const orderId = newOrderId();
  const referenceNumber = newReferenceNumber();
  await ensureSchema();
  await getPool().execute(
    `INSERT INTO yoco_orders (order_id, reference_number, status, amount_cents, currency, customer_name, customer_email, customer_phone, delivery_address, items_json)
     VALUES (?, ?, 'pending', ?, 'ZAR', ?, ?, ?, ?, ?)`,
    [orderId, referenceNumber, input.amountCents, input.name, input.email, input.phone, input.address, JSON.stringify(input.items)],
  );

  const checkoutPayload = {
    amount: input.amountCents,
    currency: 'ZAR',
    cancelUrl: `${origin}/?payment=cancelled&order_id=${encodeURIComponent(orderId)}`,
    successUrl: `${origin}/?payment=returning&order_id=${encodeURIComponent(orderId)}`,
    failureUrl: `${origin}/?payment=failed&order_id=${encodeURIComponent(orderId)}`,
    metadata: { orderId, referenceNumber, customerEmail: input.email },
    subtotalAmount: input.amountCents,
    lineItems: input.items.map((item) => ({
      displayName: `${item.product} — ${item.size}`,
      quantity: item.quantity,
      pricingDetails: { price: item.amountCents },
      description: item.description,
    })),
    clientReferenceId: orderId,
    externalId: orderId,
  };

  const response = await fetch('https://payments.yoco.com/api/checkouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': orderId,
    },
    body: JSON.stringify(checkoutPayload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.redirectUrl) {
    await getPool().execute(`UPDATE yoco_orders SET status = 'checkout_error' WHERE order_id = ?`, [orderId]);
    console.error('Yoco checkout creation failed:', response.status, result?.message || result?.error || 'unknown error');
    return json(res, 502, { error: 'Yoco could not start the secure checkout. Please try again.' });
  }

  const processingMode = result.processingMode || (process.env.YOCO_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test');
  await getPool().execute(
    `UPDATE yoco_orders SET checkout_id = ?, provider_mode = ? WHERE order_id = ?`,
    [result.id || null, processingMode, orderId],
  );
  return json(res, 200, { redirectUrl: result.redirectUrl, orderId, referenceNumber, processingMode });
};

const getOrderStatus = async (req, res, url) => {
  const orderId = clean(url.searchParams.get('order_id'), 64);
  if (!orderId) return json(res, 400, { error: 'Missing order ID.' });
  await ensureSchema();
  const [rows] = await getPool().execute(
    `SELECT order_id, reference_number, checkout_id, payment_id, status, amount_cents, currency, provider_mode, created_at, updated_at
     FROM yoco_orders WHERE order_id = ? LIMIT 1`,
    [orderId],
  );
  if (!rows[0]) return json(res, 404, { error: 'Order not found.' });
  return json(res, 200, {
    orderId: rows[0].order_id,
    referenceNumber: rows[0].reference_number,
    checkoutId: rows[0].checkout_id,
    paymentId: rows[0].payment_id,
    status: rows[0].status,
    amount: rows[0].amount_cents,
    currency: rows[0].currency,
    processingMode: rows[0].provider_mode,
  });
};

const header = (req, name) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const verifyWebhook = (rawBody, req) => {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  const webhookId = header(req, 'webhook-id');
  const timestamp = header(req, 'webhook-timestamp');
  const signatureHeader = header(req, 'webhook-signature');
  if (!secret || !webhookId || !timestamp || !signatureHeader) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 180) return false;
  const encodedSecret = secret.split('_')[1];
  if (!encodedSecret) return false;
  const signedContent = `${webhookId}.${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', Buffer.from(encodedSecret, 'base64')).update(signedContent).digest('base64');
  return signatureHeader.split(' ').some((part) => {
    const supplied = part.split(',')[1];
    if (!supplied) return false;
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
  });
};

const handleWebhook = async (req, res) => {
  const rawBody = await readBody(req);
  if (!verifyWebhook(rawBody, req)) return json(res, 403, { error: 'Invalid Yoco webhook signature.' });
  const event = JSON.parse(rawBody.toString('utf8'));
  if (!['payment.succeeded', 'payment.failed'].includes(event.type)) return json(res, 200, { received: true });

  const payment = event.payload || {};
  const eventId = clean(event.id, 128);
  const orderId = clean(payment.metadata?.orderId, 64);
  if (!eventId || !orderId || !payment.id) return json(res, 400, { error: 'Invalid Yoco payment event.' });
  await ensureSchema();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [claim] = await connection.execute(
      `INSERT IGNORE INTO yoco_webhook_events (event_id) VALUES (?)`,
      [eventId],
    );
    if (claim.affectedRows === 0) {
      await connection.commit();
      return json(res, 200, { received: true, duplicate: true });
    }
    const [rows] = await connection.execute(
      `SELECT order_id, status, amount_cents, currency FROM yoco_orders WHERE order_id = ? LIMIT 1 FOR UPDATE`,
      [orderId],
    );
    if (!rows[0]) {
      await connection.commit();
      return json(res, 200, { received: true });
    }

    const expectedStatus = event.type === 'payment.succeeded' ? 'paid' : 'failed';
    const amountMatches = Number(payment.amount) === Number(rows[0].amount_cents);
    const currencyMatches = payment.currency === rows[0].currency;
    if (expectedStatus === 'paid' && (!amountMatches || !currencyMatches || payment.status !== 'succeeded')) {
      await connection.execute(
        `UPDATE yoco_orders SET status = 'amount_mismatch', provider_event_id = ?, payment_id = ?, provider_mode = ? WHERE order_id = ?`,
        [eventId, payment.id, payment.mode || null, orderId],
      );
      await connection.commit();
      return json(res, 200, { received: true });
    }
    if (rows[0].status === 'paid' && expectedStatus === 'failed') {
      await connection.commit();
      return json(res, 200, { received: true });
    }
    await connection.execute(
      `UPDATE yoco_orders
       SET status = ?, payment_id = ?, provider_event_id = ?, provider_mode = ?,
           confirmation_status = CASE WHEN ? = 'paid' AND confirmation_sent_at IS NULL THEN 'pending' ELSE confirmation_status END,
           owner_notification_status = CASE WHEN ? = 'paid' AND owner_notification_sent_at IS NULL THEN 'pending' ELSE owner_notification_status END
       WHERE order_id = ?`,
      [expectedStatus, payment.id, eventId, payment.mode || null, expectedStatus, expectedStatus, orderId],
    );
    await connection.commit();
    if (expectedStatus === 'paid') {
      try {
        await sendConfirmationOnce(orderId);
      } catch (error) {
        console.error('Order confirmation email failed:', error.message);
      }
      try {
        await sendOwnerNotificationOnce(orderId);
      } catch (error) {
        console.error('Internal order notification email failed:', error.message);
      }
    }
    return json(res, 200, { received: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export async function yocoApiHandler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/yoco/')) return false;
  try {
    if (url.pathname === '/api/yoco/create-checkout' && req.method === 'POST') return await createCheckout(req, res), true;
    if (url.pathname === '/api/yoco/webhook' && req.method === 'POST') return await handleWebhook(req, res), true;
    if (url.pathname === '/api/yoco/order-status' && req.method === 'GET') return await getOrderStatus(req, res, url), true;
    json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('Yoco API error:', error.message);
    json(res, status, { error: status >= 500 ? 'The payment service is temporarily unavailable. Please try again.' : error.message });
  }
  return true;
}
